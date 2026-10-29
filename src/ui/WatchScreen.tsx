import { useEffect, useState } from "react";
import { DECKS } from "@/decks/loadDeck";
import type { Deck } from "@/decks/types";
import {
  type GameState,
  selectPlacement,
  selectRevealedCard,
  selectTeams,
} from "@/engine";
import { decodeSnapshot } from "@/sync/codec";
import { type ListenFailure, listen, type Microphone } from "@/sync/ggwaveTransport";
import { FinalScores } from "@/ui/RoundScreen";
import { ScoreStrip } from "@/ui/ScoreStrip";
import { TeamTimeline } from "@/ui/TeamTimeline";
import { useWakeLock } from "@/ui/useWakeLock";

type Props = {
  /** Null where the browser offers no microphone at all — plain HTTP. */
  mic: Microphone | null;
  /** Reopen the mic. A tap, so the new audio context may start on iOS. */
  onRetry: () => void;
  onBack: () => void;
};

/**
 * The newest packet heard. A snapshot is the host's `GameState` as a viewer may know it —
 * no pile, no history, the card only once revealed — so it renders through the same
 * selectors as the host's screen, and track IDs are still resolved only in the engine.
 */
type Heard =
  | { kind: "snapshot"; deck: Deck; state: GameState; at: number }
  | { kind: "incompatible" };

/**
 * Someone else's timeline game, read-only, decoded from the host's ultrasonic
 * broadcast. Nothing here is sent back. See docs/product/watching.md.
 */
export function WatchScreen({ mic, onRetry, onBack }: Props) {
  const [heard, setHeard] = useState<Heard | null>(null);
  const [failure, setFailure] = useState<ListenFailure | null>(null);

  // Viewers set the phone down and watch; it must not lock between turns.
  useWakeLock();

  useEffect(() => {
    if (mic === null) return;
    setFailure(null);
    return listen(
      mic,
      (bytes) => {
        const decoded = decodeSnapshot(bytes, DECKS);
        if (decoded.ok) {
          setHeard({ kind: "snapshot", ...decoded, at: Date.now() });
        } else if (decoded.reason === "incompatible") {
          setHeard({ kind: "incompatible" });
        }
        // A corrupt packet is dropped silently: the next snapshot replaces it anyway.
      },
      setFailure,
    );
  }, [mic]);

  const back = (
    <button type="button" className="btn btn--tertiary" onClick={onBack}>
      Back
    </button>
  );

  if (mic === null) {
    return (
      <Notice title="Watching needs a secure connection" danger footer={back}>
        Phones only share their microphone with secure pages. Open this app from its
        https:// address.
      </Notice>
    );
  }

  if (failure !== null) {
    return (
      <Notice
        title={failure === "denied" ? "Microphone blocked" : "Microphone unavailable"}
        danger
        footer={
          <>
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              Try again
            </button>
            {back}
          </>
        }
      >
        The host's phone sends the game as a very high-pitched sound, so this phone needs
        its microphone to follow along. Nothing is recorded or sent anywhere.
        {failure === "denied" &&
          " If no prompt appears, allow the microphone in the browser's site settings."}
      </Notice>
    );
  }

  if (heard === null) {
    return (
      <Notice title="Waiting for the host…" footer={back}>
        Keep this phone near the host's. The game appears after the next song is drawn or
        revealed — the host needs "Let others join" switched on.
      </Notice>
    );
  }

  if (heard.kind === "incompatible") {
    return (
      <Notice title="Update the app" danger footer={back}>
        The host is playing with a different version of the app or its decks. Reload this
        page on both phones.
      </Notice>
    );
  }

  const { deck, state, at } = heard;
  const teams = selectTeams(state, deck);
  if (teams === null) return null;

  if (state.phase === "finished") {
    return (
      <main className="screen screen--centred">
        <div className="spacer" />
        <FinalScores scores={teams.timelines.map((t) => t.length)} />
        <LastUpdate at={at} />
        <div className="spacer" />
        <div className="footer">{back}</div>
      </main>
    );
  }

  const outcome = selectPlacement(state, deck);
  const revealed = selectRevealedCard(state, deck);
  // As on the host: during the reveal the turn has already moved on, so the timeline
  // shown belongs to whoever just played.
  const placingTeam = outcome ? outcome.team : teams.currentTeam;

  return (
    <main className="screen timeline-round">
      <ScoreStrip
        scores={teams.timelines.map((t) => t.length)}
        currentTeam={placingTeam}
      />

      <div className="timeline-round__head">
        {teams.timelines.length > 1 && (
          <div className="round__number">Team {placingTeam + 1}</div>
        )}
        <LastUpdate at={at} />
      </div>

      <TeamTimeline
        cards={teams.timelines[placingTeam] ?? []}
        outcome={outcome}
        // The three display fields only, as on the host: `selectRevealedCard` returns
        // the whole Card, track ID included, and that never goes into props.
        revealed={
          revealed && {
            year: revealed.year,
            title: revealed.title,
            artist: revealed.artist,
          }
        }
      />

      <div className="footer">{back}</div>
    </main>
  );
}

function Notice({
  title,
  danger = false,
  footer,
  children,
}: {
  title: string;
  danger?: boolean;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="screen screen--centred">
      <div className="spacer" />
      <h1 className={`screen__title ${danger ? "screen__title--danger" : ""}`}>
        {title}
      </h1>
      <p className="screen__body">{children}</p>
      <div className="spacer" />
      <div className="footer">{footer}</div>
    </main>
  );
}

/**
 * How long since the last packet. Lets a viewer tell a quiet turn from a lost signal —
 * the host sends nothing between draws and reveals.
 */
function LastUpdate({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.round((now - at) / 1000));
  const label =
    seconds < 5
      ? "Updated just now"
      : seconds < 60
        ? `Updated ${seconds} s ago`
        : `Updated ${Math.floor(seconds / 60)} min ago`;

  return (
    <p className="watch__updated" aria-live="off">
      {label}
    </p>
  );
}
