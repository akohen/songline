import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck } from "@/decks/types";
import type { GameState } from "@/engine";
import type { PlaybackPort } from "@/playback/types";
import { WebPlaybackSdkAdapter } from "@/playback/webPlaybackSdkAdapter";
import { AppShell } from "@/ui/AppShell";
import { drawAndPlay, playbackErrorMessage } from "@/ui/drawAndPlay";
import { GameStartScreen } from "@/ui/GameStartScreen";
import { HostSetupScreen } from "@/ui/HostSetupScreen";
import { RoundScreen } from "@/ui/RoundScreen";

type Props = {
  getAccessToken: () => string | null;
  profileName: string;
  onSignOut: () => void;
};

type Stage = "setup" | "connecting" | "start" | "playing" | "failed";

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
  const [game, setGame] = useState<GameState | null>(null);
  /** A first-round playback failure, which happens after the round screen mounts. */
  const [startError, setStartError] = useState<string | null>(null);
  /**
   * Bumped every time a game starts, and used as `RoundScreen`'s key.
   *
   * Keying on the deck id — as this did — silently breaks "Start always starts a new
   * game": starting again on the deck already loaded would not remount, so the hook's
   * initialiser would never re-run and the old game would just carry on.
   */
  const [gameKey, setGameKey] = useState(0);
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
      setStage("start");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the player.");
      setStage("failed");
    }
  }, [getAccessToken]);

  /**
   * New or resumed — the start screen has already decided which, and built the state.
   *
   * **The first card is drawn here, in the click**, not in an effect once the round
   * screen mounts. `playTrack` begins with `activateElement()`, which browsers honour
   * only inside the synchronous event path of a gesture; move it out and the first
   * track of the session sits silently paused. This function is called straight from
   * the Start/Resume button's `onClick`, which is what keeps that path intact.
   */
  const startGame = useCallback((chosen: Deck, initial: GameState) => {
    const playback = playbackRef.current;
    if (!playback) return;

    setStartError(null);
    const { next, playing } = drawAndPlay(initial, chosen, playback);
    playing.catch((err) => setStartError(playbackErrorMessage(err)));

    setDeck(chosen);
    setGame(next);
    setGameKey((n) => n + 1);
    setStage("playing");
  }, []);

  /**
   * Leaving a game does not destroy it.
   *
   * This used to call `clearGame()`, back when arriving at the round screen *was* the
   * resume and a stale save would silently reappear. Resume is now an explicit button
   * on the start screen, so clearing here would make it unreachable except after a
   * page reload. The save dies when it is replaced — pressing Start mounts a new game,
   * which writes over it.
   */
  const backToStart = useCallback(() => {
    void playbackRef.current?.pause();
    setDeck(null);
    setGame(null);
    setStage("start");
  }, []);

  const shell = (children: React.ReactNode) => (
    <AppShell
      profileName={profileName}
      deckName={deck?.name}
      onChangeDeck={deck ? backToStart : undefined}
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

    case "start":
      return shell(<GameStartScreen onStart={startGame} />);

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
      if (!playback || !deck || !game) {
        return shell(
          <main className="screen screen--centred">
            <p className="screen__body">Player not ready.</p>
          </main>,
        );
      }
      // See `gameKey`: this must change on every start, not just on every deck, or
      // starting again on the current deck would quietly continue the old game.
      return shell(
        <RoundScreen
          key={gameKey}
          deck={deck}
          initialGame={game}
          initialError={startError}
          playback={playback}
          onChangeDeck={backToStart}
        />,
      );
    }
  }
}
