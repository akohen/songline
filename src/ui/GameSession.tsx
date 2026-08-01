import { useCallback, useEffect, useRef, useState } from "react";
import { DECKS } from "@/decks/loadDeck";
import type { Deck } from "@/decks/types";
import { clearGame } from "@/engine";
import type { PlaybackPort } from "@/playback/types";
import { WebPlaybackSdkAdapter } from "@/playback/webPlaybackSdkAdapter";
import { AppShell } from "@/ui/AppShell";
import { DeckSelectScreen } from "@/ui/DeckSelectScreen";
import { HostSetupScreen } from "@/ui/HostSetupScreen";
import { RoundScreen } from "@/ui/RoundScreen";

type Props = {
  getAccessToken: () => string | null;
  profileName: string;
  onSignOut: () => void;
};

type Stage = "setup" | "connecting" | "deck" | "playing" | "failed";

/**
 * Owns the player and the current deck, and renders the shell around every screen.
 *
 * The shell lives here rather than in App because the menu needs the current deck —
 * which only this component knows — as well as the profile and sign-out, which are
 * passed down. Two props are cheaper than a context.
 */
export function GameSession({ getAccessToken, profileName, onSignOut }: Props) {
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

  /**
   * Leaving a deck abandons the game in progress.
   *
   * The saved game must be cleared here, or re-entering the same deck would restore
   * its old draw pile and the songs-remaining count would carry over. Clearing on
   * *deck selection* instead would be wrong: that path is also how a mid-game page
   * refresh gets back to the round screen, and restoring there is the whole point of
   * persisting. So the reset hangs off the explicit action, not the arrival.
   */
  const changeDeck = useCallback(() => {
    void playbackRef.current?.pause();
    clearGame();
    setDeck(null);
    setStage("deck");
  }, []);

  const shell = (children: React.ReactNode) => (
    <AppShell
      profileName={profileName}
      deckName={deck?.name}
      onChangeDeck={deck ? changeDeck : undefined}
      onSignOut={onSignOut}
    >
      {children}
    </AppShell>
  );

  switch (stage) {
    case "setup":
      return shell(<HostSetupScreen onReady={() => void connect()} />);

    case "connecting":
      return shell(
        <main className="screen screen--centred">
          <p className="screen__body">Connecting the player…</p>
        </main>,
      );

    case "deck":
      return shell(<DeckSelectScreen decks={DECKS} onSelect={chooseDeck} />);

    case "failed":
      return shell(
        <main className="screen screen--centred">
          <div className="spacer" />
          <h1 className="screen__title screen__title--danger">Player unavailable</h1>
          <p className="screen__body">{error}</p>
          <div className="spacer" />
          <div className="footer">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void connect()}
            >
              Try again
            </button>
          </div>
        </main>,
      );

    case "playing": {
      const playback = playbackRef.current;
      if (!playback || !deck) {
        return shell(
          <main className="screen screen--centred">
            <p className="screen__body">Player not ready.</p>
          </main>,
        );
      }
      // Keyed by deck so a different deck always remounts, re-running useGame's
      // initialiser. Today the deck-select step guarantees that anyway; the key
      // means it stays true if that ever stops being the case.
      return shell(
        <RoundScreen
          key={deck.id}
          deck={deck}
          playback={playback}
          onChangeDeck={changeDeck}
        />,
      );
    }
  }
}
