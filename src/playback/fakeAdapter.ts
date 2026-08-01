import type { TrackId } from "@/decks/types";
import type { PlaybackPort, PlaybackState, Unsubscribe } from "@/playback/types";

/**
 * Plays silence on a timer.
 *
 * Exists so the entire game can be built and tested with no Premium account, no
 * token and no network — which decouples all UI work from Spotify. Also the only
 * way to drive the round screen in automated tests.
 */
export class FakePlaybackAdapter implements PlaybackPort {
  private listeners = new Set<(state: PlaybackState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private state: PlaybackState = {
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    isLoading: false,
  };

  /**
   * `loadDelayMs` fakes a slow connection, so the loading state can be exercised
   * without throttling a real one. Zero — the default — plays instantly, as before.
   */
  constructor(
    private readonly trackDurationMs = 180_000,
    private readonly loadDelayMs = 0,
  ) {}

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  playTrack(_trackId: TrackId, startOffsetMs: number): Promise<void> {
    const start = () => {
      this.state = {
        isPlaying: true,
        positionMs: startOffsetMs,
        durationMs: this.trackDurationMs,
        isLoading: false,
      };
      this.startTicking();
      this.emit();
    };

    if (this.loadDelayMs <= 0) {
      start();
      return Promise.resolve();
    }

    this.stopTicking();
    this.state = { ...this.state, isPlaying: false, isLoading: true };
    this.emit();

    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(start, this.loadDelayMs);
    // Resolves on request, exactly like the real adapter: accepting a play command is
    // not the same as audio starting.
    return Promise.resolve();
  }

  pause(): Promise<void> {
    this.stopTicking();
    this.state = { ...this.state, isPlaying: false };
    this.emit();
    return Promise.resolve();
  }

  resume(): Promise<void> {
    if (this.state.durationMs > 0) {
      this.state = { ...this.state, isPlaying: true };
      this.startTicking();
      this.emit();
    }
    return Promise.resolve();
  }

  seek(positionMs: number): Promise<void> {
    this.state = { ...this.state, positionMs };
    this.emit();
    return Promise.resolve();
  }

  onStateChange(callback: (state: PlaybackState) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  suppressMetadata(): void {
    // Nothing to suppress: this adapter never touches the OS media session.
  }

  disconnect(): void {
    this.stopTicking();
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    this.listeners.clear();
  }

  private startTicking(): void {
    this.stopTicking();
    this.timer = setInterval(() => {
      const positionMs = this.state.positionMs + 1000;
      if (positionMs >= this.state.durationMs) {
        this.state = {
          ...this.state,
          positionMs: this.state.durationMs,
          isPlaying: false,
        };
        this.stopTicking();
      } else {
        this.state = { ...this.state, positionMs };
      }
      this.emit();
    }, 1000);
  }

  private stopTicking(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
