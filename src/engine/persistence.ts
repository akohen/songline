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
 * deck.
 *
 * Two repairs are applied to anything that does restore:
 *
 * 1. **Always resume at `idle`.** Audio does not survive a reload, so a restored
 *    mid-card game would show a card nobody can hear — and a game saved after a
 *    reveal would reopen with the answer already on screen.
 * 2. **Deck rot.** A deck edited between sessions may no longer contain tracks the
 *    saved pile references; unknown IDs are dropped.
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

  // Nothing was in flight, or the deck no longer contains it.
  const inFlight =
    state.currentCard !== null && known.has(state.currentCard) ? state.currentCard : null;

  return {
    ...state,
    // A restored game always resumes at `idle` (unless the deck was exhausted).
    //
    // Playback cannot survive a reload — the SDK holds nothing, and audio cannot
    // restart without a user gesture. Restoring mid-card would therefore show a card
    // that cannot be heard, and if the save was made after a reveal it would put the
    // *answer* on screen the moment the game reopened.
    phase: state.phase === "finished" ? "finished" : "idle",
    currentCard: null,
    // The in-flight card goes back to the front of the pile and the round counter is
    // rolled back, so resuming consumes nothing: the next Start replays that song.
    drawPile: inFlight === null ? drawPile : [inFlight, ...drawPile],
    round: inFlight === null ? state.round : Math.max(0, state.round - 1),
  };
}
