import { useState } from "react";
import type { Deck } from "@/decks/types";
import {
  selectPlacement,
  selectRevealedCard,
  selectRoundDisplay,
  selectTeams,
} from "@/engine";
import type { PlaybackPort } from "@/playback/types";
import { CustomiseGameScreen } from "@/ui/CustomiseGameScreen";
import { ScoreStrip } from "@/ui/ScoreStrip";
import { TeamTimeline } from "@/ui/TeamTimeline";
import { useGame } from "@/ui/useGame";
import { useWakeLock } from "@/ui/useWakeLock";

type Props = {
  deck: Deck;
  playback: PlaybackPort;
  onChangeDeck: () => void;
};

/**
 * The game screen, in either ruleset.
 *
 * Under the paper ruleset it shows the round number, a playback control and one
 * primary action — and nothing else. No album art, no waveform, no progress or
 * duration: each would give away the era or the answer, or at best add noise.
 *
 * Under the timeline ruleset the slots become the primary action and the placement
 * resolves in place. Which one applies is decided by `selectTeams` returning null,
 * not by a flag this component keeps.
 *
 * The spoiler guarantee is not enforced here. `selectRevealedCard` returns null in
 * every phase but `revealed`, so this component has no route to the year even if it
 * asked for one — and `selectTeams` hands over resolved cards, never track IDs.
 */
export function RoundScreen({ deck, playback, onChangeDeck }: Props) {
  const {
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
  } = useGame(deck, playback);

  const [showCustomise, setShowCustomise] = useState(false);
  // The slot under consideration. Reversible, and deliberately not engine state.
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // Nobody wants the phone locking mid-round while everyone argues about a year.
  useWakeLock();

  const display = selectRoundDisplay(game);
  const revealed = selectRevealedCard(game, deck);
  const teams = selectTeams(game, deck);
  const outcome = selectPlacement(game, deck);

  /** Start, Next song and Skip are all this. Clearing the slot is what makes Skip
   *  safe: a stale selection must not carry over to the next card. */
  const nextSong = () => {
    setSelectedSlot(null);
    void draw();
  };

  if (showCustomise) {
    return (
      <CustomiseGameScreen
        teamCount={game.timelines.length}
        onConfirm={(teamCount) => {
          configure(teamCount);
          setSelectedSlot(null);
          setShowCustomise(false);
        }}
        onCancel={() => setShowCustomise(false)}
      />
    );
  }

  if (display.phase === "finished") {
    return (
      <main className="screen screen--centred">
        <div className="spacer" />
        {teams ? (
          <FinalScores scores={teams.timelines.map((t) => t.length)} />
        ) : (
          <>
            <h1 className="screen__title">Deck finished</h1>
            <p className="screen__body">
              All {deck.cards.length} songs have been played.
            </p>
          </>
        )}
        <div className="spacer" />
        <div className="footer">
          <button type="button" className="btn btn--primary" onClick={restart}>
            Play this deck again
          </button>
          <button type="button" className="btn" onClick={onChangeDeck}>
            Choose another deck
          </button>
        </div>
      </main>
    );
  }

  const started = display.phase !== "idle";
  const isPlaying = playbackState?.isPlaying ?? false;

  // Before the first draw both rulesets look the same: there is nothing to show yet,
  // because seeds are not dealt until Start.
  if (!started) {
    return (
      <main className="screen round">
        <div className="spacer" />
        <h1 className="screen__title">{deck.name}</h1>
        <p className="round__meta">
          {teams
            ? `${teams.timelines.length} team${teams.timelines.length === 1 ? "" : "s"} · first to 10 cards`
            : `${display.cardsRemaining} songs`}
        </p>
        <div className="spacer" />
        {error && <p className="alert">{error}</p>}
        <div className="footer">
          <button type="button" className="btn btn--primary" onClick={nextSong}>
            Start
          </button>
          {/* The one-tap path is untouched: anyone who ignores this gets the game
              that already worked. */}
          <button
            type="button"
            className="btn btn--tertiary"
            onClick={() => setShowCustomise(true)}
          >
            Customise game
          </button>
        </div>
      </main>
    );
  }

  if (teams) {
    // During the reveal the turn has already moved on, so the timeline on screen is
    // the one belonging to whoever just played, not to whoever is next.
    const placingTeam = outcome ? outcome.team : teams.currentTeam;
    const showing = teams.timelines[placingTeam] ?? [];

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
          <p className="round__meta">
            {outcome
              ? outcome.correct
                ? "Placed."
                : "Discarded."
              : "Where does this song go?"}
          </p>
        </div>

        <PlayControl
          compact
          hasEnded={hasEnded}
          isPlaying={isPlaying}
          isLoading={isLoading}
          stillLoading={stillLoading}
          onReplay={replay}
          onToggle={togglePlayPause}
          onSkipForward={skipForward}
        />

        <TeamTimeline
          cards={showing}
          selected={selectedSlot}
          onSelect={(slot) => setSelectedSlot(slot === selectedSlot ? null : slot)}
          outcome={outcome}
          // Narrowed to the three display fields on purpose. `selectRevealedCard`
          // returns the whole Card, `spotifyTrackId` included, and handing that
          // straight to a component would put a track ID in props — which the
          // invariant forbids without exception, precisely so that no reviewer has
          // to work out whether this particular one was safe.
          revealed={
            revealed && {
              year: revealed.year,
              title: revealed.title,
              artist: revealed.artist,
            }
          }
        />

        {error && <p className="alert">{error}</p>}

        <div className="footer">
          {!outcome && (
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={selectedSlot === null}
                onClick={() => {
                  if (selectedSlot !== null) reveal(selectedSlot);
                }}
              >
                Place it here
              </button>
              {/* A free action: the same team plays again, because the turn moves on
                  a placement rather than on a draw. */}
              <button type="button" className="btn btn--tertiary" onClick={nextSong}>
                Skip this song
              </button>
            </>
          )}
          {outcome && (
            <button type="button" className="btn btn--primary" onClick={nextSong}>
              {teams.winner === null ? "Next song" : "See final scores"}
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="screen round">
      <div className="spacer" />

      {revealed ? (
        <div className="reveal">
          {/* Title and artist land first and alone; the year follows about a second
              later, so the room can register the song before the number lands. */}
          <div className="reveal__details">
            <div className="reveal__track">{revealed.title}</div>
            <div className="reveal__artist">{revealed.artist}</div>
          </div>
          <div className="reveal__year">{revealed.year}</div>
        </div>
      ) : (
        <div className="round__number">Round {display.round}</div>
      )}

      <p className="round__meta">
        {display.cardsRemaining} song{display.cardsRemaining === 1 ? "" : "s"} left
      </p>

      {/* Centred, well clear of the footer — next to Reveal it invited mis-taps. */}
      <PlayControl
        hasEnded={hasEnded}
        isPlaying={isPlaying}
        isLoading={isLoading}
        stillLoading={stillLoading}
        onReplay={replay}
        onToggle={togglePlayPause}
        onSkipForward={skipForward}
      />

      <div className="spacer" />

      {error && <p className="alert">{error}</p>}

      <div className="footer">
        {/* Exactly one primary action at any moment. */}
        {!revealed && (
          <>
            {/* Wrapped, not passed directly: `reveal` takes an optional slot, and the
                click event would arrive as one. */}
            <button type="button" className="btn btn--primary" onClick={() => reveal()}>
              Reveal the year
            </button>
            {/* Same DRAW event as Next song; different label because abandoning a
                card nobody can place is a different intent from finishing one. */}
            <button type="button" className="btn btn--tertiary" onClick={nextSong}>
              Skip this song
            </button>
          </>
        )}

        {revealed && (
          <button type="button" className="btn btn--primary" onClick={nextSong}>
            Next song
          </button>
        )}
      </div>
    </main>
  );
}

/** Standings at the end of a timeline game. Teams level at the top are simply level. */
function FinalScores({ scores }: { scores: number[] }) {
  const top = Math.max(...scores);
  const ranked = scores
    .map((score, team) => ({ score, team }))
    .sort((a, b) => b.score - a.score);

  return (
    <>
      <h1 className="screen__title">Final scores</h1>
      <ul className="standings">
        {ranked.map(({ score, team }) => (
          <li
            key={team}
            className={`standings__row ${score === top ? "standings__row--top" : ""}`}
          >
            <span>Team {team + 1}</span>
            <span className="standings__score">{score}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

type PlayControlProps = {
  hasEnded: boolean;
  isPlaying: boolean;
  /** A track has been asked for and its audio has not started. */
  isLoading: boolean;
  /** That has now gone on long enough to be worth saying out loud. */
  stillLoading: boolean;
  onReplay: () => void;
  onToggle: () => void;
  onSkipForward: () => void;
  /** Drops the text label and shrinks the circle, to leave the timeline room. */
  compact?: boolean;
};

/**
 * Playback state and its control in one element. Replay appears only at the end.
 *
 * Loading lives here rather than anywhere else on the screen because this *is* the
 * playback indicator — the ring pulse means "sound is coming out". Showing "▶ Play"
 * while a track is on its way is the specific lie this fixes: the host presses it,
 * nothing happens, and the room decides the app is broken.
 */
function PlayControl({
  hasEnded,
  isPlaying,
  isLoading,
  stillLoading,
  onReplay,
  onToggle,
  onSkipForward,
  compact = false,
}: PlayControlProps) {
  const label = isLoading
    ? stillLoading
      ? "Still loading — you can skip"
      : "Loading…"
    : hasEnded
      ? "Replay"
      : isPlaying
        ? "Pause"
        : "Play";
  const icon = hasEnded ? "↻" : isPlaying ? "❚❚" : "▶";

  return (
    <div className={`play-control ${compact ? "play-control--compact" : ""}`}>
      <div className="play-control__row">
        {/* Mirrors the forward button's footprint so the play button stays centered. */}
        <span className="play-control__spacer" aria-hidden="true" />
        <button
          type="button"
          className={`play-control__button ${
            // The pulse claims audio is playing, which while loading it is not.
            isPlaying && !hasEnded && !isLoading ? "play-control__button--playing" : ""
          }`}
          aria-label={label}
          aria-busy={isLoading}
          // Nothing to pause or restart until the track exists. Skip and the primary
          // action stay live, so a slow load never traps anyone.
          disabled={isLoading}
          onClick={hasEnded ? onReplay : onToggle}
        >
          {isLoading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <span aria-hidden="true">{icon}</span>
          )}
        </button>
        <button
          type="button"
          className="play-control__forward"
          aria-label="Skip forward 15 seconds"
          disabled={hasEnded || isLoading}
          onClick={onSkipForward}
        >
          <span aria-hidden="true">+15</span>
        </button>
      </div>
      {/* Compact mode normally hides the label, but a bare spinner is guessy — and
          under prefers-reduced-motion the spinner does not move, so the words are the
          only thing left carrying the state. */}
      {(!compact || isLoading) && <span className="play-control__label">{label}</span>}
    </div>
  );
}
