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
  const [error, setError] = useState<string | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => playback.onStateChange(setPlaybackState), [playback]);

  useEffect(() => {
    saveGame(game);
  }, [game]);

  const draw = useCallback(async () => {
    setError(null);
    const next = reduce(gameRef.current, { type: "DRAW" });
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
  }, [deck, playback]);

  const reveal = useCallback(() => {
    setGame((current) => reduce(current, { type: "REVEAL" }));
  }, []);

  const restart = useCallback(() => {
    clearGame();
    setGame(createGame(deck));
    setError(null);
    void playback.pause();
  }, [deck, playback]);

  const togglePlayPause = useCallback(() => {
    if (playbackState?.isPlaying) void playback.pause();
    else void playback.resume();
  }, [playback, playbackState]);

  const replay = useCallback(() => {
    void playback.seek(selectStartOffsetMs(gameRef.current, deck));
  }, [deck, playback]);

  return {
    game,
    playbackState,
    error,
    draw,
    reveal,
    restart,
    togglePlayPause,
    replay,
  };
}
