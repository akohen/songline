import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck } from "@/decks/types";
import type { GameState } from "@/engine";
import type { PlaybackPort } from "@/playback/types";
import { WebPlaybackSdkAdapter } from "@/playback/webPlaybackSdkAdapter";
import { createBroadcastContext, loadGgwave } from "@/sync/ggwaveTransport";
import { AppShell } from "@/ui/AppShell";
import {
  describePlaybackError,
  drawAndPlay,
  type PlaybackFailure,
} from "@/ui/drawAndPlay";
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
  const [startError, setStartError] = useState<PlaybackFailure | null>(null);
  /**
   * Bumped every time a game starts, and used as `RoundScreen`'s key.
   *
   * Keying on the deck id — as this did — silently breaks "Start always starts a new
   * game": starting again on the deck already loaded would not remount, so the hook's
   * initialiser would never re-run and the old game would just carry on.
   */
  const [gameKey, setGameKey] = useState(0);
  const playbackRef = useRef<PlaybackPort | null>(null);

  /**
   * "Let others join" — a setting of this session, not of the game. Kept here so it
   * survives a trip back to the start screen, and deliberately absent from `GameState`
   * and the save. Off by default. See docs/product/watching.md.
   */
  const [letOthersJoin, setLetOthersJoin] = useState(false);
  /** The broadcast's audio context, while a game is being broadcast. */
  const [broadcast, setBroadcast] = useState<AudioContext | null>(null);
  const broadcastRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      playbackRef.current?.disconnect();
      playbackRef.current = null;
      void broadcastRef.current?.close().catch(() => {});
      broadcastRef.current = null;
    };
  }, []);

  const changeLetOthersJoin = useCallback((on: boolean) => {
    setLetOthersJoin(on);
    // Fetch ggwave now rather than on the first packet. Only ever on demand: a host who
    // never broadcasts never downloads it.
    if (on) void loadGgwave().catch(() => {});
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
  const startGame = useCallback(
    (chosen: Deck, initial: GameState) => {
      const playback = playbackRef.current;
      if (!playback) return;

      setStartError(null);
      const { next, playing } = drawAndPlay(initial, chosen, playback);
      playing.catch((err) => setStartError(describePlaybackError(err)));

      // Also inside the click, for the same reason: iOS starts an AudioContext only from
      // a gesture. Songs-only games have nothing for a viewer to show.
      if (letOthersJoin && initial.timelines.length > 0) {
        broadcastRef.current ??= createBroadcastContext();
        void broadcastRef.current.resume().catch(() => {});
      } else {
        void broadcastRef.current?.close().catch(() => {});
        broadcastRef.current = null;
      }
      setBroadcast(broadcastRef.current);

      setDeck(chosen);
      setGame(next);
      setGameKey((n) => n + 1);
      setStage("playing");
    },
    [letOthersJoin],
  );

  /**
   * Leaving a game does not destroy it.
   *
   * This used to call `clearGame()`, back when arriving at the round screen *was* the
   * resume and a stale save would silently reappear. Resume is now an explicit button
   * on the start screen, so clearing here would make it unreachable except after a
   * page reload. The save dies when it is replaced — pressing Start mounts a new game,
   * which writes over it.
   */
  /**
   * The menu's mid-game switch for the same setting.
   *
   * Runs inside the menu item's click, so switching on can start the audio context
   * there — the same iOS gesture rule as Start. Nothing sends here: `useBroadcast`
   * transmits whenever its context changes, so the current game goes out at once and
   * phones already listening do not wait a turn.
   */
  const toggleLetOthersJoinInGame = useCallback(() => {
    if (letOthersJoin) {
      setLetOthersJoin(false);
      setBroadcast(null);
      // Suspended, not closed: switching back on resumes this one, and the
      // transmitter's cleanup never has to stop a source on a closed context.
      void broadcastRef.current?.suspend().catch(() => {});
      return;
    }
    setLetOthersJoin(true);
    broadcastRef.current ??= createBroadcastContext();
    void broadcastRef.current.resume().catch(() => {});
    setBroadcast(broadcastRef.current);
  }, [letOthersJoin]);

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
      letOthersJoin={letOthersJoin}
      // Timeline games only, as on the start screen: songs only has nothing to show.
      onToggleLetOthersJoin={
        stage === "playing" && (game?.timelines.length ?? 0) > 0
          ? toggleLetOthersJoinInGame
          : undefined
      }
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
      return shell(
        <GameStartScreen
          letOthersJoin={letOthersJoin}
          onLetOthersJoinChange={changeLetOthersJoin}
          onStart={startGame}
        />,
      );

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
          broadcast={broadcast}
          onChangeDeck={backToStart}
        />,
      );
    }
  }
}
