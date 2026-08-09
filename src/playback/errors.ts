import { PlaybackError } from "@/playback/types";

/**
 * The error body Spotify's player endpoints return.
 *
 * `reason` is documented for `/me/player/*` specifically and is the only thing that
 * separates two very different 404s. Everything is optional because a gateway can
 * answer with HTML, or nothing at all.
 */
type SpotifyErrorBody = {
  error?: { status?: number; message?: string; reason?: string };
};

/**
 * What a failed `PUT /me/player/play` actually means.
 *
 * Split out of the adapter to be testable, because the interesting case has no
 * observable difference in the status line: **404 answers both "this track is not
 * available in this market" and "the device you named does not exist"**. The second is
 * what a phone on the underground produces — the SDK's socket drops, Spotify
 * deregisters our device, and the next round accuses the deck of a network problem.
 *
 * See docs/tech/spotify-constraints.md.
 */
export function playCommandError(status: number, body: unknown): PlaybackError {
  if (status === 404) {
    const reason = (body as SpotifyErrorBody | null)?.error?.reason;
    if (reason === "NO_ACTIVE_DEVICE") {
      return new PlaybackError(
        "The player lost its connection to Spotify.",
        "connection_lost",
      );
    }
    // No reason, an unreadable body, or any other reason: the pre-existing reading.
    // Guessing "connection" from a body we could not parse would turn a rotten deck
    // entry into an unlimited Retry loop.
    return new PlaybackError(
      "This track is unavailable in your market.",
      "track_unavailable",
    );
  }

  if (status === 403) {
    return new PlaybackError(
      "Spotify refused playback. Premium is required.",
      "not_premium",
    );
  }

  // A gateway error is transient by definition, and on a flaky connection it is the
  // same failure as no connection at all. 429 is deliberately not here: rate limiting
  // is a different problem, and one track lookup per round cannot provoke it.
  if (status === 502 || status === 503 || status === 504) {
    return new PlaybackError(`Spotify is not responding (${status}).`, "connection_lost");
  }

  return new PlaybackError(`Playback request failed (${status}).`, "playback_failed");
}

/**
 * A request that never left the device.
 *
 * `fetch` rejects — rather than resolving with a status — when there was no network to
 * carry it, so this can never be a track problem. `navigator.onLine` only picks the
 * wording: `true` means an interface is up, not that Spotify is reachable, so it is
 * never used to decide anything.
 */
export function unreachableError(): PlaybackError {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return new PlaybackError(
    offline ? "You appear to be offline." : "Could not reach Spotify.",
    "connection_lost",
  );
}
