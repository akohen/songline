import type { Deck } from "@/decks/types";
import type { GameState, Phase } from "@/engine/types";
import { ALL_PHASES } from "@/engine/types";

const SCHEMA_VERSION = 1;

type Envelope = { version: number; state: GameState };

export function serialize(state: GameState): string {
  return JSON.stringify({ version: SCHEMA_VERSION, state } satisfies Envelope);
}

function isPhase(value: unknown): value is Phase {
  return ALL_PHASES.includes(value as Phase);
}

function isGameStateShape(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    isPhase(s.phase) &&
    typeof s.deckId === "string" &&
    Array.isArray(s.drawPile) &&
    s.drawPile.every((id) => typeof id === "string") &&
    (s.currentCard === null || typeof s.currentCard === "string") &&
    typeof s.round === "number"
  );
}

/**
 * Restore a saved game, or null meaning "start fresh".
 *
 * Returns null on unparseable JSON, a version or shape mismatch, or a different
 * deck. Beyond that it repairs **deck rot**: a deck edited between sessions may no
 * longer contain tracks the saved pile references. Unknown IDs are dropped, and if
 * the in-play card itself is gone the game falls back to `idle` — restoring onto a
 * silently-changed deck is exactly when this bites.
 */
export function deserialize(raw: string, deck: Deck): GameState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== SCHEMA_VERSION) return null;
  if (!isGameStateShape(envelope.state)) return null;

  const state = envelope.state;
  if (state.deckId !== deck.id) return null;

  const known = new Set(deck.cards.map((c) => c.spotifyTrackId));
  const drawPile = state.drawPile.filter((id) => known.has(id));

  if (state.currentCard !== null && !known.has(state.currentCard)) {
    return { ...state, drawPile, currentCard: null, phase: "idle" };
  }

  return { ...state, drawPile };
}
