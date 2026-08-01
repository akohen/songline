import type { Deck, TrackId } from "@/decks/types";
import type { Timeline } from "@/engine/types";

/**
 * Slot arithmetic, shared by the reducer and the selectors so the rule exists once.
 *
 * A timeline of n cards offers n+1 slots. Slot `i` is the gap *above* card `i`: slot 0
 * is before every card, slot n is after every card.
 */

/** Release year of a card, or null if the deck no longer contains it. */
export function yearOf(deck: Deck, id: TrackId): number | null {
  return deck.cards.find((card) => card.spotifyTrackId === id)?.year ?? null;
}

/**
 * Card years down a timeline, in recorded order.
 *
 * Returns null if any card is missing from the deck. That is deck rot, which
 * `deserialize` refuses to restore — a missing placed card would silently change a
 * team's score. Returning null keeps every caller from having to invent a year.
 */
export function timelineYears(deck: Deck, timeline: Timeline): number[] | null {
  const years: number[] = [];
  for (const id of timeline) {
    const year = yearOf(deck, id);
    if (year === null) return null;
    years.push(year);
  }
  return years;
}

/** Is `slot` a gap this timeline actually has? */
export function isValidSlot(years: readonly number[], slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot <= years.length;
}

/**
 * Does `year` belong in this slot?
 *
 * **Bounds are inclusive at both ends.** That is what makes a tie valid — and it means
 * a tie has *two* correct slots, either side of its equal-year neighbour. Neither is
 * more correct than the other.
 */
export function isSlotCorrect(
  years: readonly number[],
  slot: number,
  year: number,
): boolean {
  if (!isValidSlot(years, slot)) return false;
  const left = slot > 0 ? (years[slot - 1] ?? Number.NEGATIVE_INFINITY) : -Infinity;
  const right =
    slot < years.length ? (years[slot] ?? Number.POSITIVE_INFINITY) : Infinity;
  return left <= year && year <= right;
}

/**
 * Every slot `year` could legitimately have gone in — one, or two for a tie.
 *
 * Used only to show a missed placement where it belonged, so the feedback never
 * implies there was a single right answer.
 */
export function correctSlots(years: readonly number[], year: number): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot <= years.length; slot++) {
    if (isSlotCorrect(years, slot, year)) slots.push(slot);
  }
  return slots;
}
