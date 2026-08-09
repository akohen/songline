import type { TrackId } from "@/decks/types";

/**
 * `inPlay` means "a card is in play", NOT "audio is currently running".
 *
 * Audio can be paused, replayed or finished while the card is still in play.
 * Playback state belongs to the playback adapter and never enters GameState —
 * mirroring it here would make the engine impure and give playback two sources
 * of truth. See docs/tech/architecture.md.
 */
export type Phase = "idle" | "inPlay" | "revealed" | "finished";

/** Every phase, for exhaustive iteration in tests. Keep in sync with `Phase`. */
export const ALL_PHASES = ["idle", "inPlay", "revealed", "finished"] as const;

/**
 * One team's placed cards, in the order they were placed.
 *
 * Non-decreasing by year, never strictly increasing: a tie may be placed either side
 * of its equal-year neighbour, so two cards from the same year sit in whatever order
 * the players chose. Never re-sort this — the recorded order is authoritative, and
 * sorting would silently reorder tied cards and make a correct placement look wrong
 * on the following round.
 */
export type Timeline = TrackId[];

/** Cards a team needs to win. */
export const TARGET_SCORE = 10;

export type GameState = {
  phase: Phase;
  deckId: string;
  /** Pre-shuffled at creation, so DRAW is a pure take-from-head. */
  drawPile: TrackId[];
  currentCard: TrackId | null;
  /** 0 before the first draw; 1 during the first song. */
  round: number;
  /**
   * One timeline per team. **Empty means the default ruleset** — no teams, no
   * placement, no score, the game players keep on paper. This is the only mode flag
   * there is: a separate boolean could disagree with the array, and team count is
   * just `timelines.length`. See docs/product/timeline-ruleset.md.
   */
  timelines: Timeline[];
  /** Index into `timelines`. Meaningless, and ignored, when `timelines` is empty. */
  currentTeam: number;
  /**
   * Output of the last reveal, for rendering the outcome. Null outside `revealed`.
   *
   * `team` is recorded because `currentTeam` has already moved on by the time this is
   * read — the placement belongs to whoever just played, not to whoever is next.
   */
  lastPlacement: { team: number; slot: number; correct: boolean } | null;
  /** Every song once revealed, in play order. Never pruned or reordered. */
  history: HistoryEntry[];
};

/**
 * One song already revealed to players. A skipped card (abandoned before ever
 * being revealed) leaves no entry — this is not a record of every song drawn.
 */
export type HistoryEntry = {
  trackId: TrackId;
  /** Team that placed it, or null under the paper ruleset. */
  team: number | null;
  /** Whether the placement was correct, or null under the paper ruleset (no scoring). */
  correct: boolean | null;
};

/**
 * Two events, which is the whole machine.
 *
 * There is no SKIP: with nothing scored, abandoning a card and finishing one are
 * the same act, and DRAW already does it. That is also the recovery path for a
 * track that fails to play.
 *
 * `slot` on REVEAL is a placement — "this card belongs in the gap at this index".
 * Its absence is the default ruleset's plain reveal. A separate PLACED phase was
 * considered and rejected: slot selection is reversible and holds no card data, so it
 * belongs to the component, and the phase would have nothing to do but wait for a
 * second tap.
 */
export type GameEvent = { type: "DRAW" } | { type: "REVEAL"; slot?: number };
