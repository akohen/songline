import type { TrackId } from "@/decks/types";

/**
 * `inPlay` means "a card is in play", NOT "audio is currently running".
 *
 * Audio can be paused, replayed or finished while the card is still in play.
 * Playback state belongs to the playback adapter and never enters GameState —
 * mirroring it here would make the engine impure and give playback two sources
 * of truth. See docs/03-architecture.md.
 */
export type Phase = "idle" | "inPlay" | "revealed" | "finished";

/** Every phase, for exhaustive iteration in tests. Keep in sync with `Phase`. */
export const ALL_PHASES = ["idle", "inPlay", "revealed", "finished"] as const;

export type GameState = {
  phase: Phase;
  deckId: string;
  /** Pre-shuffled at creation, so DRAW is a pure take-from-head. */
  drawPile: TrackId[];
  currentCard: TrackId | null;
  /** 0 before the first draw; 1 during the first song. */
  round: number;
};

/**
 * Two events, which is the whole machine.
 *
 * There is no SKIP: with nothing scored, abandoning a card and finishing one are
 * the same act, and DRAW already does it. That is also the recovery path for a
 * track that fails to play.
 */
export type GameEvent = { type: "DRAW" } | { type: "REVEAL" };
