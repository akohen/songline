import type { Deck } from "@/decks/types";
import { selectRevealedCard, selectRoundDisplay } from "@/engine";
import type { PlaybackPort } from "@/playback/types";
import { useGame } from "@/ui/useGame";

type Props = {
  deck: Deck;
  playback: PlaybackPort;
  onChangeDeck: () => void;
};

/**
 * The game screen.
 *
 * Shows the round number, playback controls, Reveal and Start/Next song — and
 * nothing else. No album art, no waveform, no tab-title updates: every one of those
 * would give away the era or the answer.
 *
 * The spoiler guarantee is not enforced here. `selectRevealedCard` returns null in
 * every phase but `revealed`, so this component has no route to the year even if it
 * asked for one.
 */
export function RoundScreen({ deck, playback, onChangeDeck }: Props) {
  const { game, playbackState, error, draw, reveal, restart, togglePlayPause, replay } =
    useGame(deck, playback);

  const display = selectRoundDisplay(game);
  const revealed = selectRevealedCard(game, deck);

  if (display.phase === "finished") {
    return (
      <section>
        <h1>Deck finished</h1>
        <p>All {deck.cards.length} songs have been played.</p>
        <button type="button" onClick={restart}>
          Play this deck again
        </button>{" "}
        <button type="button" onClick={onChangeDeck}>
          Choose another deck
        </button>
      </section>
    );
  }

  const started = display.phase !== "idle";

  return (
    <section>
      <h1>{started ? `Round ${display.round}` : deck.name}</h1>
      <p>{display.cardsRemaining} songs left in the deck</p>

      {error && <p role="alert">{error}</p>}

      {started && (
        <p>
          {playbackState?.isPlaying ? "▶ playing" : "❚❚ paused"}
          {" · "}
          <button type="button" onClick={togglePlayPause}>
            {playbackState?.isPlaying ? "Pause" : "Play"}
          </button>{" "}
          <button type="button" onClick={replay}>
            Replay from start
          </button>
        </p>
      )}

      {/* The year lands first and alone; title and artist follow, so the moment the
          argument is settled stays uncluttered. */}
      {revealed ? (
        <div>
          <p style={{ fontSize: "4rem", fontWeight: 700, margin: "1rem 0" }}>
            {revealed.year}
          </p>
          <p style={{ opacity: 0.75 }}>
            {revealed.title} — {revealed.artist}
          </p>
        </div>
      ) : (
        started && (
          <p>
            <button type="button" onClick={reveal}>
              Reveal the year
            </button>
          </p>
        )
      )}

      <p>
        <button type="button" onClick={() => void draw()}>
          {started ? "Next song" : "Start"}
        </button>
      </p>

      <p>
        <small>
          {deck.name} ·{" "}
          <button type="button" onClick={onChangeDeck}>
            Change deck
          </button>
        </small>
      </p>
    </section>
  );
}
