import type { TrackId } from "@/decks/types";

export type PlaybackState = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  /**
   * A track has been requested and its audio has not started yet.
   *
   * Not the same as `!isPlaying`: a paused track is loaded, and a *loading* track is
   * usually silent while the previous one is still winding down. Distinguishing them
   * is the whole point — on a slow connection "▶ Play" is a lie, because the track is
   * already on its way and pressing play does nothing.
   */
  isLoading: boolean;
};

export type PlaybackErrorKind =
  | "not_premium"
  | "init_failed"
  | "auth_failed"
  | "playback_failed"
  | "track_unavailable";

export class PlaybackError extends Error {
  constructor(
    message: string,
    readonly kind: PlaybackErrorKind,
  ) {
    super(message);
    this.name = "PlaybackError";
  }
}

export type Unsubscribe = () => void;

/**
 * What the game needs from a player, and nothing more.
 *
 * Two real implementations are planned — the Web Playback SDK (primary) and Web API
 * device control (fallback) — plus a fake for development. The engine never imports
 * this; the UI wires the two together. See docs/03-architecture.md.
 */
export interface PlaybackPort {
  /** Resolves once a device exists and can accept playback. */
  initialize(): Promise<void>;

  playTrack(trackId: TrackId, startOffsetMs: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;

  onStateChange(callback: (state: PlaybackState) => void): Unsubscribe;

  /**
   * Overwrite the OS-level "now playing" metadata with neutral placeholders.
   *
   * Must be re-applied after every track change: the SDK populates
   * navigator.mediaSession itself and will happily overwrite ours.
   */
  suppressMetadata(): void;

  disconnect(): void;
}
