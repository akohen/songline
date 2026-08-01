import type { GameEvent, GameState } from "@/engine/types";

/**
 * The game's state machine. Pure and total.
 *
 * Unhandled combinations return the *same state reference*, unchanged. No throwing:
 * a reducer that throws on an unexpected event turns a stale click into a crashed
 * party. Returning the identical reference also keeps React re-renders honest.
 */
export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "DRAW": {
      if (state.phase === "finished") return state;

      const [next, ...rest] = state.drawPile;
      // Deck exhausted. `currentCard` is cleared so nothing lingers revealable.
      if (next === undefined) {
        return { ...state, phase: "finished", currentCard: null };
      }

      // Valid from idle, inPlay and revealed alike — this is the single
      // "Start" / "Next song" button.
      return {
        ...state,
        phase: "inPlay",
        drawPile: rest,
        currentCard: next,
        round: state.round + 1,
      };
    }

    case "REVEAL": {
      if (state.phase !== "inPlay") return state;
      return { ...state, phase: "revealed" };
    }
  }
}
