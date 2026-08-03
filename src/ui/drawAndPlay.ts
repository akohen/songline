import type { Deck } from "@/decks/types";
import {
  type GameState,
  reduce,
  selectStartOffsetMs,
  selectTrackIdForPlayback,
} from "@/engine";
import type { PlaybackPort } from "@/playback/types";

/**
 * Draw the next card and start its audio.
 *
 * **Callers must invoke this synchronously from a click.** `playTrack` begins with
 * `activateElement()`, which browsers only honour inside the synchronous event path of
 * a user gesture. Reach it from a `useEffect` or after an `await` instead and the first
 * track of the session transfers to our device and sits paused — silent, no error,
 * nothing in the console, and only ever the first one. See
 * docs/tech/spotify-constraints.md.
 *
 * That requirement is the only reason this is not simply a method on `useGame`: a
 * round can now begin from two places, and the ordering is too easy to get subtly
 * wrong twice.
 *
 * The playback promise is returned rather than awaited, so the caller decides where a
 * failure is displayed. It is already in flight when this returns.
 */
export function drawAndPlay(
  state: GameState,
  deck: Deck,
  playback: PlaybackPort,
): { next: GameState; playing: Promise<void> } {
  const next = reduce(state, { type: "DRAW" }, deck);

  const trackId = selectTrackIdForPlayback(next);
  // Deck exhausted: the round screen shows the finished state instead.
  if (trackId === null) return { next, playing: Promise.resolve() };

  // The track ID goes straight from the engine to the adapter and never into React
  // state or the DOM — it is one lookup away from being the answer.
  return { next, playing: playback.playTrack(trackId, selectStartOffsetMs(next, deck)) };
}

/** Worded once, so a failure reads the same wherever a round was started from. */
export function playbackErrorMessage(err: unknown): string {
  return err instanceof Error
    ? `${err.message} Press Next song to move on.`
    : "Playback failed. Press Next song to move on.";
}
