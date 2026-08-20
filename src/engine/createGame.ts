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

type Options = {
  /**
   * Teams to play with, each getting a timeline. 0 — the default — is the paper
   * ruleset: no teams, no placement, no score.
   */
  teamCount?: number;
  rng?: () => number;
  /**
   * Restrict the pile to these track IDs instead of the whole deck. Used to play on
   * only the songs a previous game never reached, so a second game does not repeat the
   * first. IDs not present in `deck.cards` are dropped — the caller's set can predate a
   * deck edit, and a card the deck no longer defines has no year to score against.
   */
  cardIds?: readonly TrackId[];
};

/**
 * Shuffling happens here, once — never in the reducer.
 *
 * That is what lets `reduce` be a pure, total function: the pile is already in its
 * final order, so DRAW merely takes the head. Tests inject a seeded `rng` for
 * determinism.
 *
 * Seed cards are *not* dealt here. They come off the shuffled pile on the first DRAW,
 * so this stays a shuffle and nothing has to be undone if the game is reconfigured
 * before it starts.
 */
export function createGame(deck: Deck, options: Options = {}): GameState {
  const { teamCount = 0, rng = Math.random, cardIds } = options;
  const deckIds: TrackId[] = deck.cards.map((card) => card.spotifyTrackId);
  // Deck rot: a supplied ID the deck no longer defines has no year to score against,
  // so drop it — mirrors the drawPile filter in persistence.ts.
  const trackIds = cardIds ? cardIds.filter((id) => deckIds.includes(id)) : deckIds;
  return {
    phase: "idle",
    deckId: deck.id,
    drawPile: shuffle(trackIds, rng),
    currentCard: null,
    round: 0,
    timelines: Array.from({ length: Math.max(0, Math.trunc(teamCount)) }, () => []),
    currentTeam: 0,
    lastPlacement: null,
    history: [],
  };
}
