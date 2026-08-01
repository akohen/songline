import { API_BASE } from "@/auth/config";
import type { TrackId } from "@/decks/types";
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
 * would display the track being guessed. See docs/02-spotify-constraints.md.
 */
export class WebPlaybackSdkAdapter implements PlaybackPort {
  private player: Spotify.Player | null = null;
  private deviceId: string | null = null;
  private listeners = new Set<(state: PlaybackState) => void>();

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

      this.emit({
        isPlaying: !state.paused,
        positionMs: state.position,
        durationMs: state.duration,
      });
    });

    const deviceId = await new Promise<string>((resolve, reject) => {
      player.addListener("ready", ({ device_id }) => resolve(device_id));

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

    this.deviceId = deviceId;
    suppressAll();
  }

  async playTrack(trackId: TrackId, startOffsetMs: number): Promise<void> {
    await this.command("PUT", `/me/player/play?device_id=${this.requireDevice()}`, {
      uris: [`spotify:track:${trackId}`],
      position_ms: startOffsetMs,
    });
    suppressAll();
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
    this.listeners.clear();
  }

  private requirePlayer(): Spotify.Player {
    if (!this.player) {
      throw new PlaybackError("Player is not initialised.", "init_failed");
    }
    return this.player;
  }

  private requireDevice(): string {
    if (!this.deviceId) {
      throw new PlaybackError("No playback device is ready.", "init_failed");
    }
    return this.deviceId;
  }

  private async command(method: string, path: string, body: unknown): Promise<void> {
    const token = this.getToken();
    if (!token) throw new PlaybackError("Not signed in.", "auth_failed");

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok || response.status === 204) return;

    // 404 here means the track is not available in this market, which is a deck
    // problem rather than a player problem — the round screen offers "Next song".
    if (response.status === 404) {
      throw new PlaybackError(
        "This track is unavailable in your market.",
        "track_unavailable",
      );
    }
    if (response.status === 403) {
      throw new PlaybackError(
        "Spotify refused playback. Premium is required.",
        "not_premium",
      );
    }

    throw new PlaybackError(
      `Playback request failed (${response.status}).`,
      "playback_failed",
    );
  }

  private emit(state: PlaybackState): void {
    for (const listener of this.listeners) listener(state);
  }
}
