/**
 * OS-level metadata suppression — the single most important spoiler defence
 * outside our own DOM.
 *
 * The browser publishes "now playing" information to macOS Control Centre, the
 * Windows media overlay, Android notifications and the browser's own media button
 * popup. The Web Playback SDK fills that in with the real track, which would show
 * the answer on screen while players are still arguing about it.
 *
 * See docs/tech/spotify-constraints.md — this is the leak surface we can address in
 * code; speakers with displays and other logged-in Spotify clients are covered by
 * the host setup checklist instead.
 */

/** Deliberately says nothing about the track. */
const PLACEHOLDER_TITLE = "Song Timeline";
const PLACEHOLDER_ARTIST = "Guess the year";

export function isMediaSessionSupported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/**
 * Replace whatever the SDK published with neutral placeholders.
 *
 * Call after every track change and on every player state change: the SDK resets
 * the metadata on its own schedule, so setting this once is not enough.
 */
export function suppressMediaSessionMetadata(): void {
  if (!isMediaSessionSupported()) return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: PLACEHOLDER_TITLE,
      artist: PLACEHOLDER_ARTIST,
      album: "",
      // An empty artwork list stops the OS falling back to the album cover, which
      // is itself a giveaway.
      artwork: [],
    });
  } catch {
    // Suppression is best-effort. Losing it must not stop the music.
  }
}

/**
 * Remove the OS's seek and track-navigation controls.
 *
 * Position data lets a lock screen render a scrubber, and previous/next handlers
 * invite the OS to show track affordances. Neither belongs in this game.
 */
export function suppressMediaSessionControls(): void {
  if (!isMediaSessionSupported()) return;

  try {
    navigator.mediaSession.playbackState = "playing";
    for (const action of [
      "previoustrack",
      "nexttrack",
      "seekbackward",
      "seekforward",
      "seekto",
    ] as const) {
      navigator.mediaSession.setActionHandler(action, null);
    }
    navigator.mediaSession.setPositionState?.(undefined);
  } catch {
    // Not all browsers implement every action; ignore the ones that reject.
  }
}

export function suppressAll(): void {
  suppressMediaSessionMetadata();
  suppressMediaSessionControls();
}
