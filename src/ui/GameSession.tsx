import { useCallback, useEffect, useRef, useState } from "react";
import { DECKS } from "@/decks/loadDeck";
import type { Deck } from "@/decks/types";
import type { PlaybackPort } from "@/playback/types";
import { WebPlaybackSdkAdapter } from "@/playback/webPlaybackSdkAdapter";
import { DeckSelectScreen } from "@/ui/DeckSelectScreen";
import { HostSetupScreen } from "@/ui/HostSetupScreen";
import { RoundScreen } from "@/ui/RoundScreen";

type Props = {
  getAccessToken: () => string | null;
};

type Stage = "setup" | "connecting" | "deck" | "playing" | "failed";

export function GameSession({ getAccessToken }: Props) {
  const [stage, setStage] = useState<Stage>("setup");
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const playbackRef = useRef<PlaybackPort | null>(null);

  useEffect(() => {
    return () => {
      playbackRef.current?.disconnect();
      playbackRef.current = null;
    };
  }, []);

  /**
   * The player is created here rather than on mount because browser autoplay policy
   * requires a user gesture — the "Ready" button is that gesture.
   */
  const connect = useCallback(async () => {
    setStage("connecting");
    setError(null);
    try {
      const adapter = new WebPlaybackSdkAdapter(getAccessToken);
      await adapter.initialize();
      playbackRef.current = adapter;
      setStage("deck");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the player.");
      setStage("failed");
    }
  }, [getAccessToken]);

  const chooseDeck = useCallback((chosen: Deck) => {
    setDeck(chosen);
    setStage("playing");
  }, []);

  switch (stage) {
    case "setup":
      return <HostSetupScreen onReady={() => void connect()} />;

    case "connecting":
      return <p>Connecting the player…</p>;

    case "deck":
      return <DeckSelectScreen decks={DECKS} onSelect={chooseDeck} />;

    case "failed":
      return (
        <section>
          <h1>Player unavailable</h1>
          <p>{error}</p>
          <button type="button" onClick={() => void connect()}>
            Try again
          </button>
        </section>
      );

    case "playing": {
      const playback = playbackRef.current;
      if (!playback || !deck) return <p>Player not ready.</p>;
      return (
        <RoundScreen
          deck={deck}
          playback={playback}
          onChangeDeck={() => {
            void playback.pause();
            setDeck(null);
            setStage("deck");
          }}
        />
      );
    }
  }
}
