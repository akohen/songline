import type { Deck } from "@/decks/types";
import { selectRevealedCard, selectRoundDisplay } from "@/engine";
import type { PlaybackPort } from "@/playback/types";
import { useGame } from "@/ui/useGame";
import { useWakeLock } from "@/ui/useWakeLock";

type Props = {
  deck: Deck;
  playback: PlaybackPort;
  onChangeDeck: () => void;
};

/**
 * The game screen.
 *
 * Shows the round number, a playback control and one primary action — and nothing
 * else. No album art, no waveform, no progress or duration: each would give away the
 * era or the answer, or at best add noise.
 *
 * The spoiler guarantee is not enforced here. `selectRevealedCard` returns null in
 * every phase but `revealed`, so this component has no route to the year even if it
 * asked for one.
 */
export function RoundScreen({ deck, playback, onChangeDeck }: Props) {
  const {
    game,
    playbackState,
    hasEnded,
    error,
    draw,
    reveal,
    restart,
    togglePlayPause,
    replay,
    skipForward,
  } = useGame(deck, playback);

  // Nobody wants the phone locking mid-round while everyone argues about a year.
  useWakeLock();

  const display = selectRoundDisplay(game);
  const revealed = selectRevealedCard(game, deck);

  if (display.phase === "finished") {
    return (
      <main className="screen screen--centred">
        <div className="spacer" />
        <h1 className="screen__title">Deck finished</h1>
        <p className="screen__body">All {deck.cards.length} songs have been played.</p>
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

  return (
    <main className="screen round">
      <div className="spacer" />

      {started ? (
        revealed ? (
          <div className="reveal">
            <div className="reveal__year">{revealed.year}</div>
            {/* Year lands first and alone; the rest follows about a second later, so
                the moment the argument is settled stays uncluttered. */}
            <div className="reveal__details">
              <div className="reveal__track">{revealed.title}</div>
              <div className="reveal__artist">{revealed.artist}</div>
            </div>
          </div>
        ) : (
          <div className="round__number">Round {display.round}</div>
        )
      ) : (
        <h1 className="screen__title">{deck.name}</h1>
      )}

      <p className="round__meta">
        {display.cardsRemaining} song{display.cardsRemaining === 1 ? "" : "s"} left
      </p>

      {/* Centred, well clear of the footer — next to Reveal it invited mis-taps. */}
      {started && (
        <PlayControl
          hasEnded={hasEnded}
          isPlaying={isPlaying}
          onReplay={replay}
          onToggle={togglePlayPause}
          onSkipForward={skipForward}
        />
      )}

      <div className="spacer" />

      {error && <p className="alert">{error}</p>}

      <div className="footer">
        {/* Exactly one primary action at any moment. */}
        {!started && (
          <button type="button" className="btn btn--primary" onClick={() => void draw()}>
            Start
          </button>
        )}

        {started && !revealed && (
          <>
            <button type="button" className="btn btn--primary" onClick={reveal}>
              Reveal the year
            </button>
            {/* Same DRAW event as Next song; different label because abandoning a
                card nobody can place is a different intent from finishing one. */}
            <button
              type="button"
              className="btn btn--tertiary"
              onClick={() => void draw()}
            >
              Skip this song
            </button>
          </>
        )}

        {started && revealed && (
          <button type="button" className="btn btn--primary" onClick={() => void draw()}>
            Next song
          </button>
        )}
      </div>
    </main>
  );
}

type PlayControlProps = {
  hasEnded: boolean;
  isPlaying: boolean;
  onReplay: () => void;
  onToggle: () => void;
  onSkipForward: () => void;
};

/** Playback state and its control in one element. Replay appears only at the end. */
function PlayControl({
  hasEnded,
  isPlaying,
  onReplay,
  onToggle,
  onSkipForward,
}: PlayControlProps) {
  const label = hasEnded ? "Replay" : isPlaying ? "Pause" : "Play";
  const icon = hasEnded ? "↻" : isPlaying ? "❚❚" : "▶";

  return (
    <div className="play-control">
      <div className="play-control__row">
        {/* Mirrors the forward button's footprint so the play button stays centered. */}
        <span className="play-control__spacer" aria-hidden="true" />
        <button
          type="button"
          className={`play-control__button ${
            isPlaying && !hasEnded ? "play-control__button--playing" : ""
          }`}
          aria-label={label}
          onClick={hasEnded ? onReplay : onToggle}
        >
          <span aria-hidden="true">{icon}</span>
        </button>
        <button
          type="button"
          className="play-control__forward"
          aria-label="Skip forward 15 seconds"
          disabled={hasEnded}
          onClick={onSkipForward}
        >
          <span aria-hidden="true">+15</span>
        </button>
      </div>
      <span className="play-control__label">{label}</span>
    </div>
  );
}
