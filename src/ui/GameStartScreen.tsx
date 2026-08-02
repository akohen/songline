import { useMemo, useState } from "react";
import { DECKS } from "@/decks/loadDeck";
import type { Deck } from "@/decks/types";
import { createGame, type GameState, loadGame } from "@/engine";

type Props = {
  onStart: (deck: Deck, game: GameState) => void;
};

const MIN_TEAMS = 1;
const MAX_TEAMS = 4;

function yearRange(deck: Deck): string {
  const years = deck.cards.map((card) => card.year).sort((a, b) => a - b);
  return years.length === 0 ? "—" : `${years[0]}–${years[years.length - 1]}`;
}

/**
 * Everything a game needs before it starts: deck, mode, teams — and the one saved
 * game, if there is one.
 *
 * **Start always starts a new game.** Restoring used to happen implicitly, just by
 * arriving at the round screen, which left no way to say "no, fresh please" and no way
 * to tell which of the two you had got. Resume is now a button, and the only route
 * back into a save.
 */
export function GameStartScreen({ onStart }: Props) {
  /**
   * The saved game, and which deck it belongs to.
   *
   * `loadGame` returns null for a deck the save is not for, so scanning is enough —
   * and it inherits the whole validation path for free: a save that fails its version,
   * shape or deck-rot checks simply produces no Resume button, which is exactly right.
   *
   * Read once on mount. Re-reading would be worse than useless: pressing Start
   * overwrites the save immediately, so a live value would blink away mid-screen.
   */
  const saved = useMemo(
    () =>
      DECKS.map((deck) => ({ deck, game: loadGame(deck) })).find(
        (candidate): candidate is { deck: Deck; game: GameState } =>
          candidate.game !== null,
      ),
    [],
  );

  const [deck, setDeck] = useState<Deck>(saved?.deck ?? (DECKS[0] as Deck));
  const [timeline, setTimeline] = useState((saved?.game.timelines.length ?? 0) > 0);
  // Remembered while "songs only" is selected, so toggling back and forth does not
  // silently discard a choice the host already made.
  const [teams, setTeams] = useState(Math.max(saved?.game.timelines.length ?? 0, 2));

  return (
    <main className="screen">
      <h1 className="screen__title">New game</h1>

      <ul className="deck-list">
        {DECKS.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className="deck-card"
              aria-pressed={option.id === deck.id}
              onClick={() => setDeck(option)}
            >
              <div className="deck-card__name">{option.name}</div>
              <div className="deck-card__meta">
                {option.cards.length} songs · {yearRange(option)}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <ul className="deck-list">
        <li>
          <button
            type="button"
            className="deck-card"
            aria-pressed={!timeline}
            onClick={() => setTimeline(false)}
          >
            <div className="deck-card__name">Songs only</div>
            <div className="deck-card__meta">
              You keep the timeline on paper. No teams, no score.
            </div>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="deck-card"
            aria-pressed={timeline}
            onClick={() => setTimeline(true)}
          >
            <div className="deck-card__name">Timeline in the app</div>
            <div className="deck-card__meta">
              Place each song on your team's timeline. First to 10 cards wins.
            </div>
          </button>
        </li>
      </ul>

      {/* Teams are numbered, never named: a name means a text input and a keyboard
          over the screen, for something everyone in the room already knows. */}
      {timeline && (
        <div className="stepper">
          <span className="stepper__label" id="team-count">
            Teams
          </span>
          <div className="stepper__controls">
            <button
              type="button"
              className="stepper__button"
              aria-label="One fewer team"
              disabled={teams <= MIN_TEAMS}
              onClick={() => setTeams((n) => Math.max(MIN_TEAMS, n - 1))}
            >
              −
            </button>
            <output className="stepper__value" aria-labelledby="team-count">
              {teams}
            </output>
            <button
              type="button"
              className="stepper__button"
              aria-label="One more team"
              disabled={teams >= MAX_TEAMS}
              onClick={() => setTeams((n) => Math.min(MAX_TEAMS, n + 1))}
            >
              +
            </button>
          </div>
        </div>
      )}

      {timeline && teams === 1 && (
        <p className="screen__body">
          One team is a fine game on its own — you are building a single timeline
          together.
        </p>
      )}

      <div className="spacer" />

      <div className="footer">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() =>
            onStart(deck, createGame(deck, { teamCount: timeline ? teams : 0 }))
          }
        >
          Start
        </button>

        {/* Resumes what was saved, not what is selected above — the deck highlighted
            here has no bearing on a game already in progress. */}
        {saved && (
          <button
            type="button"
            className="btn"
            onClick={() => onStart(saved.deck, saved.game)}
          >
            Resume {saved.deck.name} · round {saved.game.round}
          </button>
        )}
      </div>
    </main>
  );
}
