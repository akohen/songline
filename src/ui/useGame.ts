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

  /**
   * Detect end-of-track, so the round screen can offer Replay instead of Pause.
   *
   * Latched off the furthest position reached rather than the current position,
   * because it is not established what the SDK reports when a single-URI track
   * finishes: it may rest at `duration`, or reset `position` to 0. Reading the
   * high-water mark is correct either way — the value was recorded before any reset.
   *
   * Accepted edge case: pausing by hand inside the last 1.5s shows Replay.
   */
  useEffect(
    () =>
      playback.onStateChange((state) => {
        setPlaybackState(state);
        if (state.durationMs <= 0) return;

        maxPositionRef.current = Math.max(maxPositionRef.current, state.positionMs);
        const reachedEnd = maxPositionRef.current >= state.durationMs - 1500;
        if (!state.isPlaying && reachedEnd) setHasEnded(true);
      }),
    [playback],
  );

  const resetEndTracking = useCallback(() => {
    maxPositionRef.current = 0;
    setHasEnded(false);
  }, []);

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
