import { API_BASE } from "@/auth/config";
import type { TrackId } from "@/decks/types";
import { playCommandError, unreachableError } from "@/playback/errors";
import { loadSpotifySdk } from "@/playback/loadSdk";
import { suppressAll } from "@/playback/mediaSession";
import {
  PlaybackError,
  type PlaybackPort,
  type PlaybackState,
  type Unsubscribe,
} from "@/playback/types";

const PLAYER_NAME = "Song Timeline";

type GetToken = () => string | null;

/**
 * Playback through the Web Playback SDK: the browser itself becomes a Spotify
 * Connect device, so audio comes out of the host machine.
 *
 * Chosen over remote-controlling an existing device because that device's screen
 * would display the track being guessed. See docs/tech/spotify-constraints.md.
 */
export class WebPlaybackSdkAdapter implements PlaybackPort {
  private player: Spotify.Player | null = null;
  private deviceId: string | null = null;
  private elementActivated = false;
  private listeners = new Set<(state: PlaybackState) => void>();
  /**
   * The track we have asked for but not yet heard. Null once its audio is running.
   *
   * `playTrack` resolving only means Spotify *accepted* the command — on a slow
   * connection most of the wait happens after that, while the track buffers. This is
   * what lets the UI describe that window honestly.
   */
  private pendingTrackId: TrackId | null = null;
  /** Last state the SDK sent, so a request can re-emit without inventing numbers. */
  private lastState: PlaybackState = {
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    isLoading: false,
  };

  constructor(private readonly getToken: GetToken) {}

  async initialize(): Promise<void> {
    await loadSpotifySdk();

    const player = new Spotify.Player({
      name: PLAYER_NAME,
      getOAuthToken: (callback) => {
        const token = this.getToken();
        if (token) callback(token);
      },
      volume: 0.8,
    });

    this.player = player;

    player.addListener("player_state_changed", (state) => {
      if (!state) return;

      // Re-assert on every state change: the SDK republishes the real track
      // metadata to the OS whenever playback changes.
      suppressAll();

      // The requested track has arrived and stopped buffering.
      //
      // Both halves matter. Without the ID check the *outgoing* track's final events
      // would clear the flag the instant a new song was requested, so the loading
      // state would never be visible. Without `state.loading` it would clear while
      // the track is still buffering, which is the part of the wait worth reporting.
      //
      // Comparing this ID against one we were handed ourselves tells the UI nothing
      // it did not already ask for, and no ID leaves this class.
      if (
        this.pendingTrackId !== null &&
        state.track_window.current_track?.id === this.pendingTrackId &&
        !state.loading
      ) {
        this.pendingTrackId = null;
      }

      this.emit({
        isPlaying: !state.paused,
        positionMs: state.position,
        durationMs: state.duration,
        isLoading: this.pendingTrackId !== null,
      });
    });

    // Registered for the player's whole life, not just until the first `ready`.
    //
    // The device ID is not a constant: the SDK deregisters our device when its socket
    // drops — backgrounded tab, tunnel — and registers it again on reconnect. Capturing
    // it once, as this did, left the adapter naming a device that no longer existed, so
    // every play command 404'd until the page was reloaded. Worse, that 404 read as
    // "unavailable in your market", blaming the deck for a network problem.
    let markReady: (() => void) | null = null;
    player.addListener("ready", ({ device_id }) => {
      this.deviceId = device_id;
      markReady?.();
    });
    player.addListener("not_ready", () => {
      this.deviceId = null;
    });

    await new Promise<void>((resolve, reject) => {
      // Resolving twice is a no-op, so later `ready` events pass through harmlessly.
      markReady = resolve;

      // These three, by contrast, are only meaningful before `ready`: afterwards they
      // reject a settled promise and vanish. Surfacing a mid-session authentication
      // failure needs an error channel on PlaybackState, which does not exist — see
      // docs/tech/spotify-constraints.md.
      player.addListener("initialization_error", ({ message }) =>
        reject(new PlaybackError(message, "init_failed")),
      );
      player.addListener("authentication_error", ({ message }) =>
        reject(new PlaybackError(message, "auth_failed")),
      );
      player.addListener("account_error", ({ message }) =>
        reject(
          new PlaybackError(
            `${message} — the Web Playback SDK requires Spotify Premium, and ` +
              "excludes mobile-only Premium plans.",
            "not_premium",
          ),
        ),
      );

      void player.connect().then((connected) => {
        if (!connected) {
          reject(new PlaybackError("The player could not connect.", "init_failed"));
        }
      });
    });

    suppressAll();
  }

  async playTrack(trackId: TrackId, startOffsetMs: number): Promise<void> {
    // Announced before the first await, because the SDK sends no event when a track
    // is *requested* — only when one arrives. Waiting for it would leave the screen
    // claiming "Play" for exactly the stretch we are trying to explain.
    this.pendingTrackId = trackId;
    this.emit({ ...this.lastState, isLoading: true });

    try {
      // MUST be the first statement after that: it has to be initiated inside the
      // synchronous event path of the tap that started the round. `emit` above is
      // synchronous and does not break the chain. See activateElement below.
      await this.activateElement();

      await this.command("PUT", `/me/player/play?device_id=${this.requireDevice()}`, {
        uris: [`spotify:track:${trackId}`],
        position_ms: startOffsetMs,
      });
    } catch (error) {
      // The round screen surfaces this; a spinner underneath the error would only
      // suggest something is still on its way.
      this.pendingTrackId = null;
      this.emit({ ...this.lastState, isLoading: false });
      throw error;
    }
    suppressAll();
  }

  /**
   * Unblock the SDK's audio element, once per player.
   *
   * Without this the *first* track of a session transfers to our device and then
   * sits paused — silent, with no error anywhere. Every later track plays, because
   * by then the user has tapped something. Spotify's docs: "Some browsers prevent
   * autoplay of media by ensuring that all playback is triggered by synchronous
   * event-paths originating from user interaction such as a click… Otherwise it will
   * be in pause state once it's transferred."
   *
   * "Synchronous event-path" is the important part, and is why this cannot live in
   * initialize(): the player does not exist until several awaits after the click
   * that starts connection, so the gesture is long gone. playTrack, by contrast, is
   * reached synchronously from the Start button's handler.
   *
   * The flag is set before awaiting so a browser that rejects activation is not
   * asked again on every round.
   */
  private async activateElement(): Promise<void> {
    if (this.elementActivated || !this.player) return;
    this.elementActivated = true;
    try {
      await this.player.activateElement();
    } catch {
      // Best effort. If it fails, playback may still work — and failing the round
      // over it would be worse than a silent first track.
    }
  }

  async pause(): Promise<void> {
    await this.requirePlayer().pause();
  }

  async resume(): Promise<void> {
    await this.requirePlayer().resume();
    suppressAll();
  }

  async seek(positionMs: number): Promise<void> {
    await this.requirePlayer().seek(positionMs);
  }

  onStateChange(callback: (state: PlaybackState) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  suppressMetadata(): void {
    suppressAll();
  }

  disconnect(): void {
    this.player?.disconnect();
    this.player = null;
    this.deviceId = null;
    this.elementActivated = false;
    this.pendingTrackId = null;
    this.listeners.clear();
  }

  private requirePlayer(): Spotify.Player {
    if (!this.player) {
      throw new PlaybackError("Player is not initialised.", "init_failed");
    }
    return this.player;
  }

  /**
   * Past a successful `initialize`, a null device ID can only mean `not_ready` fired —
   * so this is a connection that dropped, not a player that never started, and Retry is
   * a reasonable thing to offer.
   */
  private requireDevice(): string {
    if (!this.deviceId) {
      throw new PlaybackError(
        "The player lost its connection to Spotify.",
        "connection_lost",
      );
    }
    return this.deviceId;
  }

  private async command(method: string, path: string, body: unknown): Promise<void> {
    const token = this.getToken();
    if (!token) throw new PlaybackError("Not signed in.", "auth_failed");

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      // `fetch` rejects rather than resolving when there was no network to carry the
      // request — a phone in a tunnel. Uncaught, this surfaced as a bare
      // "Failed to fetch" in the round screen's error banner.
      throw unreachableError();
    }

    if (response.ok || response.status === 204) return;

    // The body is what separates a market-restricted track from a device that
    // deregistered while the connection was down; both answer 404. Guarded because an
    // error response is not obliged to be JSON.
    const errorBody = await response.json().catch(() => null);
    throw playCommandError(response.status, errorBody);
  }

  private emit(state: PlaybackState): void {
    this.lastState = state;
    for (const listener of this.listeners) listener(state);
  }
}
