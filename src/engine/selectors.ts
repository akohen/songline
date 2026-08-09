import type { Card, Deck, TrackId } from "@/decks/types";
import { correctSlots, timelineYears, yearOf } from "@/engine/placement";
import type { GameState, Phase } from "@/engine/types";
import { TARGET_SCORE } from "@/engine/types";

/**
 * THE spoiler gate.
 *
 * Returns null in every phase but `revealed`. This is the project's single most
 * important correctness property, which is why it lives in a pure, unit-tested
 * function rather than in a component that must remember not to render something.
 *
 * The UI has no other route to a card's year, title or artist.
 */
export function selectRevealedCard(state: GameState, deck: Deck): Card | null {
  if (state.phase !== "revealed") return null;
  if (state.currentCard === null) return null;
  return deck.cards.find((c) => c.spotifyTrackId === state.currentCard) ?? null;
}

export type RoundDisplay = {
  /** 0 before the first draw. */
  round: number;
  cardsRemaining: number;
  /** Not a spoiler — the UI needs it to decide which buttons to show. */
  phase: Phase;
};

/** Everything the UI may render before the reveal. Nothing here identifies a track. */
export function selectRoundDisplay(state: GameState): RoundDisplay {
  return {
    round: state.round,
    cardsRemaining: state.drawPile.length,
    phase: state.phase,
  };
}

/**
 * The one deliberate hole in the gate: playback needs the track ID before reveal.
 *
 * Contract: the result goes straight to the playback adapter. It must never enter
 * React state, component props, or the DOM — a track ID is one lookup away from
 * being the answer. Named to make misuse obvious in review.
 */
export function selectTrackIdForPlayback(state: GameState): TrackId | null {
  return state.currentCard;
}

/** A placed card, resolved for display. Deliberately has no track ID. */
export type PlacedCard = { year: number; title: string; artist: string };

export type TeamsDisplay = {
  /** One entry per team, in team order. A team's score is its length. */
  timelines: PlacedCard[][];
  currentTeam: number;
  /** Team that reached the target, or null. Derived; a score is never stored. */
  winner: number | null;
};

/**
 * Everything the placement UI needs, or null under the paper ruleset.
 *
 * Null rather than an empty array so the two rulesets are distinguishable at a glance,
 * mirroring how `timelines: []` encodes the mode in the first place.
 *
 * This exists to resolve track IDs **inside the engine**. A placed card is already
 * revealed, so there is nothing left to spoil — but handing components a `TrackId[]`
 * and letting them look up the deck would make IDs-in-props the natural thing to
 * write, and a stray `currentCard` looks no different from a harmless placed one.
 * Keeping the rule absolute is what makes any breach a review-stopper.
 */
export function selectTeams(state: GameState, deck: Deck): TeamsDisplay | null {
  if (state.timelines.length === 0) return null;

  const resolve = (id: TrackId): PlacedCard | null => {
    const card = deck.cards.find((c) => c.spotifyTrackId === id);
    return card === undefined
      ? null
      : { year: card.year, title: card.title, artist: card.artist };
  };

  const won = state.timelines.findIndex((t) => t.length >= TARGET_SCORE);

  return {
    timelines: state.timelines.map((t) =>
      t.map(resolve).filter((c): c is PlacedCard => c !== null),
    ),
    currentTeam: state.currentTeam,
    winner: won === -1 ? null : won,
  };
}

export type PlacementOutcome = {
  team: number;
  /** The slot the player chose. */
  slot: number;
  correct: boolean;
  /**
   * Where the card could legitimately have gone — empty when the guess was right.
   *
   * A list because a tie has two valid slots. The UI must not present one of them as
   * *the* answer when there were several.
   */
  correctSlots: number[];
};

/**
 * How the last placement resolved. Gated exactly like `selectRevealedCard`.
 *
 * Returns null in every phase but `revealed`, so a placement outcome cannot appear
 * before the card it describes.
 */
export function selectPlacement(state: GameState, deck: Deck): PlacementOutcome | null {
  if (state.phase !== "revealed") return null;
  const placement = state.lastPlacement;
  if (placement === null) return null;
  if (state.currentCard === null) return null;

  const year = yearOf(deck, state.currentCard);
  const timeline = state.timelines[placement.team];
  if (year === null || timeline === undefined) return null;

  // A correct card was inserted into this timeline, so the slots are recomputed
  // against the timeline *without* it — the question is where it could have gone.
  const placed = placement.correct;
  const without = placed
    ? [...timeline.slice(0, placement.slot), ...timeline.slice(placement.slot + 1)]
    : timeline;
  const years = timelineYears(deck, without);

  return {
    team: placement.team,
    slot: placement.slot,
    correct: placement.correct,
    correctSlots: placement.correct || years === null ? [] : correctSlots(years, year),
  };
}

/** Playback start offset for the current card, per docs/tech/deck-format.md. */
export function selectStartOffsetMs(state: GameState, deck: Deck): number {
  const card = deck.cards.find((c) => c.spotifyTrackId === state.currentCard);
  return card?.startOffsetMs ?? 0;
}

/** A previously revealed song, resolved for display. Deliberately has no track ID. */
export type HistoryDisplay = {
  year: number;
  title: string;
  artist: string;
  /** Team that placed it, or null under the paper ruleset. */
  team: number | null;
  /** Whether the placement was correct, or null under the paper ruleset. */
  correct: boolean | null;
};

/**
 * Every song revealed so far, in play order. Safe in every phase: an entry only
 * exists because `REVEAL` already put that same title/artist/year on screen, so
 * there is nothing left here for the current or a future card to spoil.
 */
export function selectHistory(state: GameState, deck: Deck): HistoryDisplay[] {
  return state.history.flatMap((entry) => {
    const card = deck.cards.find((c) => c.spotifyTrackId === entry.trackId);
    if (card === undefined) return [];
    return [
      {
        year: card.year,
        title: card.title,
        artist: card.artist,
        team: entry.team,
        correct: entry.correct,
      },
    ];
  });
}

/**
 * Track ID and start offset for a past, already-revealed song, for replay.
 *
 * Contract: the result goes straight to the playback adapter. It must never enter
 * React state, component props, or the DOM — same rule as `selectTrackIdForPlayback`,
 * just applied to history instead of the in-play card.
 */
export function selectHistoryEntryForReplay(
  state: GameState,
  deck: Deck,
  index: number,
): { trackId: TrackId; startOffsetMs: number } | null {
  const entry = state.history[index];
  if (entry === undefined) return null;
  const card = deck.cards.find((c) => c.spotifyTrackId === entry.trackId);
  if (card === undefined) return null;
  return { trackId: entry.trackId, startOffsetMs: card.startOffsetMs ?? 0 };
}
