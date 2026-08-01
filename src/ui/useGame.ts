import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck } from "@/decks/types";
import {
  clearGame,
  createGame,
  type GameState,
  loadGame,
  reduce,
  saveGame,
  selectStartOffsetMs,
  selectTrackIdForPlayback,
} from "@/engine";
import type { PlaybackPort, PlaybackState } from "@/playback/types";

/** How long a track may take to start before the screen admits it is slow. */
const SLOW_LOAD_MS = 15_000;

/**
 * Wires the pure engine to a playback adapter.
 *
 * The engine decides *which* card is in play; the adapter decides what the audio is
 * doing. Neither knows about the other — this hook is the only place they meet.
 */
export function useGame(deck: Deck, playback: PlaybackPort) {
  const [game, setGame] = useState<GameState>(() => loadGame(deck) ?? createGame(deck));
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [hasEnded, setHasEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const maxPositionRef = useRef(0);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearEndTimer = useCallback(() => {
    if (endTimerRef.current !== null) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  }, []);

  /**
   * Detect end-of-track, so the round screen can offer Replay instead of Pause.
   *
   * Latched off the furthest position reached rather than the current position,
   * because it is not established what the SDK reports when a single-URI track
   * finishes: it may rest at `duration`, or reset `position` to 0.
   *
   * That high-water mark alone is not sufficient, though: confirmed by logging raw
   * SDK events, a natural end arrives with no intervening state update near
   * `duration` at all — position jumps straight from wherever playback was to a
   * reset-looking `{ paused: true, position: 0 }`, so the mark never climbs high
   * enough to satisfy the tolerance below. A fallback timer covers that gap: every
   * "playing" update reschedules a timeout for when the track is expected to run
   * out, so the UI does not depend on the SDK sending one final event in time.
   *
   * Accepted edge case: pausing by hand inside the last 1.5s shows Replay.
   */
  useEffect(() => {
    const unsubscribe = playback.onStateChange((state) => {
      setPlaybackState(state);
      // While a track is loading the numbers still describe the *outgoing* one. A
      // final event from a song that had nearly finished would otherwise latch
      // `hasEnded` onto the card just drawn, offering Replay for a song that has
      // not played a note.
      if (state.isLoading) return;
      if (state.durationMs <= 0) return;

      maxPositionRef.current = Math.max(maxPositionRef.current, state.positionMs);
      const reachedEnd = maxPositionRef.current >= state.durationMs - 1500;

      if (!state.isPlaying) {
        clearEndTimer();
        if (reachedEnd) setHasEnded(true);
        return;
      }

      clearEndTimer();
      const remainingMs = Math.max(0, state.durationMs - state.positionMs - 1500);
      endTimerRef.current = setTimeout(() => setHasEnded(true), remainingMs);
    });
    return () => {
      unsubscribe();
      clearEndTimer();
    };
  }, [playback, clearEndTimer]);

  const isLoading = playbackState?.isLoading ?? false;

  /**
   * Loading has gone on long enough to be worth mentioning.
   *
   * A patience threshold, not a playback fact, which is why it lives here and not in
   * the adapter. Nothing is blocked when it trips — the host is simply told that Skip
   * exists, rather than being left watching a spinner.
   */
  const [stillLoading, setStillLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setStillLoading(false);
      return;
    }
    const timer = setTimeout(() => setStillLoading(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const resetEndTracking = useCallback(() => {
    maxPositionRef.current = 0;
    setHasEnded(false);
    clearEndTimer();
  }, [clearEndTimer]);

  useEffect(() => {
    saveGame(game);
  }, [game]);

  const draw = useCallback(async () => {
    setError(null);
    resetEndTracking();
    const next = reduce(gameRef.current, { type: "DRAW" }, deck);
    setGame(next);

    const trackId = selectTrackIdForPlayback(next);
    if (trackId === null) return; // deck exhausted

    try {
      // The track ID goes straight from the engine to the adapter and never into
      // React state or the DOM — it is one lookup away from being the answer.
      await playback.playTrack(trackId, selectStartOffsetMs(next, deck));
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Press Next song to move on.`
          : "Playback failed. Press Next song to move on.",
      );
    }
  }, [deck, playback, resetEndTracking]);

  /**
   * Reveal, optionally as a placement.
   *
   * `slot` is required under the timeline ruleset and meaningless without it; the
   * engine judges which applies and ignores the mismatch. The slot the player is
   * *considering* never comes through here — selection is reversible and lives in the
   * component until it is confirmed.
   */
  const reveal = useCallback(
    (slot?: number) => {
      setGame((current) => reduce(current, { type: "REVEAL", slot }, deck));
    },
    [deck],
  );

  const restart = useCallback(() => {
    clearGame();
    setGame(createGame(deck, { teamCount: gameRef.current.timelines.length }));
    setError(null);
    resetEndTracking();
    void playback.pause();
  }, [deck, playback, resetEndTracking]);

  /**
   * Choose the ruleset. Only reachable before the first draw, where replacing the
   * game wholesale costs nothing but a reshuffle.
   *
   * The choice needs no storage of its own — it is recoverable from
   * `timelines.length`, and the save effect below persists it like any other change.
   */
  const configure = useCallback(
    (teamCount: number) => {
      setGame(createGame(deck, { teamCount }));
    },
    [deck],
  );

  const togglePlayPause = useCallback(() => {
    if (playbackState?.isPlaying) void playback.pause();
    else void playback.resume();
  }, [playback, playbackState]);

  const replay = useCallback(() => {
    resetEndTracking();
    void playback.seek(selectStartOffsetMs(gameRef.current, deck));
    void playback.resume();
  }, [deck, playback, resetEndTracking]);

  const skipForward = useCallback(() => {
    if (!playbackState) return;
    const { positionMs, durationMs } = playbackState;
    const target =
      durationMs > 0
        ? Math.min(positionMs + 15000, durationMs - 500)
        : positionMs + 15000;
    void playback.seek(target);
  }, [playback, playbackState]);

  return {
    game,
    playbackState,
    hasEnded,
    isLoading,
    stillLoading,
    error,
    draw,
    reveal,
    restart,
    configure,
    togglePlayPause,
    replay,
    skipForward,
  };
}
