import type { Card, Deck, TrackId } from "@/decks/types";
import type { GameState, Phase } from "@/engine/types";

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

/** Playback start offset for the current card, per docs/04-deck-format.md. */
export function selectStartOffsetMs(state: GameState, deck: Deck): number {
  const card = deck.cards.find((c) => c.spotifyTrackId === state.currentCard);
  return card?.startOffsetMs ?? 0;
}
