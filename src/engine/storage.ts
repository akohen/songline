import type { Deck } from "@/decks/types";
import { deserialize, serialize } from "@/engine/persistence";
import type { GameState } from "@/engine/types";

/**
 * Thin, impure localStorage wrapper. Kept separate from persistence.ts so the
 * interesting logic stays testable in a node environment.
 */

const STORAGE_KEY = "song-timeline:game";

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Private browsing or a full quota. A game that cannot be resumed is far
    // better than one that crashes mid-round on a write.
  }
}

export function loadGame(deck: Deck): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : deserialize(raw, deck);
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See saveGame.
  }
}
