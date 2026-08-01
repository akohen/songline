import type { Deck, TrackId } from "@/decks/types";
import type { GameState } from "@/engine/types";

/** Fisher–Yates. Returns a new array; the input is not mutated. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    // biome-ignore lint/style/noNonNullAssertion: i and j are both in range
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Shuffling happens here, once — never in the reducer.
 *
 * That is what lets `reduce` be a pure, total function: the pile is already in its
 * final order, so DRAW merely takes the head. Tests inject a seeded `rng` for
 * determinism.
 */
export function createGame(deck: Deck, rng: () => number = Math.random): GameState {
  const trackIds: TrackId[] = deck.cards.map((card) => card.spotifyTrackId);
  return {
    phase: "idle",
    deckId: deck.id,
    drawPile: shuffle(trackIds, rng),
    currentCard: null,
    round: 0,
  };
}
