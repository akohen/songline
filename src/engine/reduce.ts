import type { Deck } from "@/decks/types";
import { isSlotCorrect, isValidSlot, timelineYears, yearOf } from "@/engine/placement";
import type { GameEvent, GameState, Timeline } from "@/engine/types";
import { TARGET_SCORE } from "@/engine/types";

/**
 * The game's state machine. Pure and total.
 *
 * Unhandled combinations return the *same state reference*, unchanged. No throwing:
 * a reducer that throws on an unexpected event turns a stale click into a crashed
 * party. Returning the identical reference also keeps React re-renders honest.
 *
 * `deck` is card data, not I/O — the same argument the selectors already take. The
 * reducer needs it to judge a placement, and judging it anywhere else would be worse:
 * having the UI compute correctness means the UI reading the current card's year while
 * the card is still in play, which is precisely the second route to the answer that
 * the spoiler gate exists to prevent.
 */
export function reduce(state: GameState, event: GameEvent, deck: Deck): GameState {
  switch (event.type) {
    case "DRAW": {
      if (state.phase === "finished") return state;

      // A won game ends here rather than in REVEAL, so the winning placement is still
      // revealed and read out before the scores appear. Consumes no card.
      if (winner(state) !== null) {
        return { ...state, phase: "finished", currentCard: null };
      }

      const seeded = dealSeeds(state);

      const [next, ...rest] = seeded.drawPile;
      // Deck exhausted. `currentCard` is cleared so nothing lingers revealable.
      if (next === undefined) {
        return { ...seeded, phase: "finished", currentCard: null };
      }

      // Valid from idle, inPlay and revealed alike — this is the single
      // "Start" / "Next song" button.
      return {
        ...seeded,
        phase: "inPlay",
        drawPile: rest,
        currentCard: next,
        round: state.round + 1,
        lastPlacement: null,
      };
    }

    case "REVEAL": {
      if (state.phase !== "inPlay") return state;

      const timelineMode = state.timelines.length > 0;

      // Under the paper ruleset a reveal carries no placement, and under the timeline
      // ruleset it must: a card nobody placed is abandoned with Skip, not revealed.
      if (timelineMode === (event.slot === undefined)) return state;
      if (event.slot === undefined) return { ...state, phase: "revealed" };

      return place(state, deck, event.slot);
    }
  }
}

/** The team that reached the target, or null. Derived — a score is never stored. */
function winner(state: GameState): number | null {
  const index = state.timelines.findIndex((t) => t.length >= TARGET_SCORE);
  return index === -1 ? null : index;
}

/**
 * One card per team, off the head of the pile, before the first song.
 *
 * Without a seed the first placement has a single slot and is unconditionally
 * correct, which reads as a bug rather than a rule.
 *
 * Keyed on every timeline being empty, **never** on `round === 0`: restoring a save
 * rolls the in-flight card back and decrements `round`, so a game saved during round
 * one would come back at zero and re-seed, dealing every team a second card and eating
 * more of the pile.
 */
function dealSeeds(state: GameState): GameState {
  if (state.timelines.length === 0) return state;
  if (!state.timelines.every((t) => t.length === 0)) return state;

  const pile = [...state.drawPile];
  const timelines: Timeline[] = state.timelines.map(() => {
    const seed = pile.shift();
    // A deck too small to seed every team leaves the rest empty rather than throwing;
    // the draw immediately after will find the pile empty and finish the game.
    return seed === undefined ? [] : [seed];
  });

  return { ...state, drawPile: pile, timelines };
}

/** Resolve a placement: score it, and reveal it either way. */
function place(state: GameState, deck: Deck, slot: number): GameState {
  const card = state.currentCard;
  if (card === null) return state;

  const timeline = state.timelines[state.currentTeam];
  if (timeline === undefined) return state;

  const years = timelineYears(deck, timeline);
  const year = yearOf(deck, card);
  // Deck rot mid-game: nothing sane to score against, so the tap does nothing.
  if (years === null || year === null) return state;

  // A slot this timeline does not have is a stale tap, not a wrong guess.
  if (!isValidSlot(years, slot)) return state;
  const correct = isSlotCorrect(years, slot, year);

  // A wrong placement discards the card. That is the whole cost — it simply never
  // joins a timeline, and it has already left the draw pile.
  const timelines = correct
    ? state.timelines.map((t, i) =>
        i === state.currentTeam ? [...t.slice(0, slot), card, ...t.slice(slot)] : t,
      )
    : state.timelines;

  return {
    ...state,
    phase: "revealed",
    timelines,
    // The turn moves on a placement, not on a draw. A skipped card was never placed,
    // so the same team plays again without that needing to be encoded anywhere.
    currentTeam: (state.currentTeam + 1) % state.timelines.length,
    lastPlacement: { team: state.currentTeam, slot, correct },
  };
}
