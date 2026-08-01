import classicsInternational from "@/decks/classics-international.json";
import hitsterRock from "@/decks/hitster-rock.json";
import testDeck from "@/decks/test-deck.json";
import type { Deck } from "@/decks/types";

/**
 * Decks are bundled at build time — no CMS, no database, versioned with the code.
 * Validated by `pnpm validate:decks`.
 *
 * The test deck is listed first so it is the obvious pick when trying the app out.
 * Its songs deliberately do not appear in the real deck, so testing does not spoil
 * cards you would rather hear for the first time during a game.
 */
export const DECKS: Deck[] = [
  testDeck as Deck,
  classicsInternational as Deck,
  hitsterRock as Deck,
];

export function getDeck(id: string): Deck | undefined {
  return DECKS.find((deck) => deck.id === id);
}
