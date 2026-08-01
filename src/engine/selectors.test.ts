import { describe, expect, it } from "vitest";
import { testDeck } from "@/decks/__fixtures__/testDeck";
import {
  selectRevealedCard,
  selectRoundDisplay,
  selectStartOffsetMs,
  selectTrackIdForPlayback,
} from "@/engine/selectors";
import type { GameState, Phase } from "@/engine/types";
import { ALL_PHASES } from "@/engine/types";

/** A state in `phase`, always with a card in hand, so phase is the only variable. */
function stateIn(phase: Phase): GameState {
  return {
    phase,
    deckId: testDeck.id,
    drawPile: ["track-f"],
    currentCard: "track-c",
    round: 3,
  };
}

describe("ALL_PHASES", () => {
  // If someone adds a phase to the union without adding it here, this fails —
  // which in turn forces the spoiler-gate suite below to consider it.
  it("lists every phase in the Phase union", () => {
    const exhaustive: Record<Phase, true> = {
      idle: true,
      inPlay: true,
      revealed: true,
      finished: true,
    };
    expect([...ALL_PHASES].sort()).toEqual(Object.keys(exhaustive).sort());
  });
});

describe("spoiler gate: selectRevealedCard", () => {
  const leaky = ALL_PHASES.filter((p) => p !== "revealed");

  it.each(leaky)("returns null in phase %s, even with a card in hand", (phase) => {
    expect(selectRevealedCard(stateIn(phase), testDeck)).toBeNull();
  });

  it("returns the card once revealed", () => {
    const card = selectRevealedCard(stateIn("revealed"), testDeck);
    expect(card).not.toBeNull();
    expect(card?.spotifyTrackId).toBe("track-c");
    expect(card?.year).toBe(1984);
  });

  it("returns null when no card is in play", () => {
    const state = { ...stateIn("revealed"), currentCard: null };
    expect(selectRevealedCard(state, testDeck)).toBeNull();
  });

  it("returns null when the card is not in the given deck", () => {
    const state = { ...stateIn("revealed"), currentCard: "track-unknown" };
    expect(selectRevealedCard(state, testDeck)).toBeNull();
  });
});

describe("spoiler gate: selectRoundDisplay", () => {
  it.each([...ALL_PHASES])("exposes nothing identifying in phase %s", (phase) => {
    const display = selectRoundDisplay(stateIn(phase));

    expect(Object.keys(display).sort()).toEqual(["cardsRemaining", "phase", "round"]);

    // No value in the payload may reveal the answer, directly or by lookup.
    const serialized = JSON.stringify(display);
    expect(serialized).not.toContain("1984"); // the year
    expect(serialized).not.toContain("Song C"); // the title
    expect(serialized).not.toContain("Artist C"); // the artist
    expect(serialized).not.toContain("track-c"); // the Spotify ID
  });

  it("reports the round and how many cards are left", () => {
    const display = selectRoundDisplay(stateIn("inPlay"));
    expect(display).toEqual({ round: 3, cardsRemaining: 1, phase: "inPlay" });
  });
});

describe("selectTrackIdForPlayback", () => {
  // The one deliberate hole: playback needs the ID before the reveal.
  it("returns the track ID while still in play", () => {
    expect(selectTrackIdForPlayback(stateIn("inPlay"))).toBe("track-c");
  });

  it("returns null when no card is in play", () => {
    const state = { ...stateIn("idle"), currentCard: null };
    expect(selectTrackIdForPlayback(state)).toBeNull();
  });
});

describe("selectStartOffsetMs", () => {
  it("defaults to 0 when the card sets no offset", () => {
    expect(selectStartOffsetMs(stateIn("inPlay"), testDeck)).toBe(0);
  });

  it("returns the card's offset when set", () => {
    const state = { ...stateIn("inPlay"), currentCard: "track-e" };
    expect(selectStartOffsetMs(state, testDeck)).toBe(30_000);
  });

  it("defaults to 0 for an unknown card", () => {
    const state = { ...stateIn("inPlay"), currentCard: "track-unknown" };
    expect(selectStartOffsetMs(state, testDeck)).toBe(0);
  });
});
