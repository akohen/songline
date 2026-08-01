import type { Deck } from "@/decks/types";
import type { GameState, Phase } from "@/engine/types";
import { ALL_PHASES } from "@/engine/types";

/** 2 added teams, timelines and the placement outcome. Version 1 saves are discarded. */
const SCHEMA_VERSION = 2;

type Envelope = { version: number; state: GameState };

export function serialize(state: GameState): string {
  return JSON.stringify({ version: SCHEMA_VERSION, state } satisfies Envelope);
}

function isPhase(value: unknown): value is Phase {
  return ALL_PHASES.includes(value as Phase);
}

function isTrackIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

function isPlacement(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.team === "number" &&
    typeof p.slot === "number" &&
    typeof p.correct === "boolean"
  );
}

function isGameStateShape(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    isPhase(s.phase) &&
    typeof s.deckId === "string" &&
    isTrackIdArray(s.drawPile) &&
    (s.currentCard === null || typeof s.currentCard === "string") &&
    typeof s.round === "number" &&
    Array.isArray(s.timelines) &&
    s.timelines.every(isTrackIdArray) &&
    typeof s.currentTeam === "number" &&
    isPlacement(s.lastPlacement)
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

  // Deck rot on a *timeline* is not repairable: dropping the card would silently
  // change that team's score, and a game whose standings moved under the players is
  // worse than a lost save. Refuse it, as a mismatched deck is refused. The draw pile
  // below is different — dropping an unplayed card costs nobody anything.
  if (state.timelines.some((t) => t.some((id) => !known.has(id)))) return null;

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
    // Reveal output, and the game resumes before the reveal. Left set, it would render
    // an outcome for a card nobody is playing. Teams, timelines and whose turn it is
    // all survive: they need no audio and give nothing away.
    lastPlacement: null,
  };
}
