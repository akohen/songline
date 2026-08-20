import { describe, expect, it } from "vitest";
import { testDeck } from "@/decks/__fixtures__/testDeck";
import type { Deck } from "@/decks/types";
import { createGame } from "@/engine/createGame";
import { seededRng } from "@/engine/testUtils";

describe("createGame", () => {
  it("starts idle with no card drawn", () => {
    const state = createGame(testDeck, { rng: seededRng(1) });
    expect(state.phase).toBe("idle");
    expect(state.currentCard).toBeNull();
    expect(state.round).toBe(0);
    expect(state.deckId).toBe(testDeck.id);
  });

  // A shuffle that drops or duplicates a card is otherwise completely silent.
  it("puts every track in the pile exactly once", () => {
    const state = createGame(testDeck, { rng: seededRng(42) });
    const expected = testDeck.cards.map((c) => c.spotifyTrackId);

    expect(state.drawPile).toHaveLength(expected.length);
    expect([...state.drawPile].sort()).toEqual([...expected].sort());
  });

  it("is deterministic for a given seed", () => {
    const a = createGame(testDeck, { rng: seededRng(7) });
    const b = createGame(testDeck, { rng: seededRng(7) });
    expect(a.drawPile).toEqual(b.drawPile);
  });

  it("actually shuffles", () => {
    // Guards against a no-op shuffle: across many seeds, at least one ordering
    // must differ from the deck's original order.
    const original = testDeck.cards.map((c) => c.spotifyTrackId);
    const orderings = Array.from({ length: 20 }, (_, i) =>
      createGame(testDeck, { rng: seededRng(i) }).drawPile.join(","),
    );
    expect(orderings.some((o) => o !== original.join(","))).toBe(true);
  });

  it("does not mutate the deck", () => {
    const before = testDeck.cards.map((c) => c.spotifyTrackId);
    createGame(testDeck, { rng: seededRng(3) });
    expect(testDeck.cards.map((c) => c.spotifyTrackId)).toEqual(before);
  });

  it("handles an empty deck", () => {
    const empty: Deck = { ...testDeck, cards: [] };
    const state = createGame(empty, { rng: seededRng(1) });
    expect(state.drawPile).toEqual([]);
    expect(state.phase).toBe("idle");
  });

  // `timelines` is the only mode flag there is, so its emptiness is load-bearing.
  it("defaults to the paper ruleset — no teams", () => {
    const state = createGame(testDeck, { rng: seededRng(1) });
    expect(state.timelines).toEqual([]);
    expect(state.currentTeam).toBe(0);
    expect(state.lastPlacement).toBeNull();
  });

  it("gives each team an empty timeline, without dealing seeds", () => {
    const state = createGame(testDeck, { teamCount: 3, rng: seededRng(1) });
    expect(state.timelines).toEqual([[], [], []]);
    // Seeds come off the pile on the first draw, not here.
    expect(state.drawPile).toHaveLength(testDeck.cards.length);
  });

  it("starts with no song history", () => {
    const state = createGame(testDeck, { rng: seededRng(1) });
    expect(state.history).toEqual([]);
  });

  describe("with cardIds — playing again on the un-played remainder", () => {
    it("restricts the pile to exactly the given IDs", () => {
      const subset = testDeck.cards.slice(0, 2).map((c) => c.spotifyTrackId);
      const state = createGame(testDeck, { cardIds: subset, rng: seededRng(1) });
      expect([...state.drawPile].sort()).toEqual([...subset].sort());
    });

    it("drops IDs the deck no longer defines (deck rot)", () => {
      const [known] = testDeck.cards.map((c) => c.spotifyTrackId);
      const state = createGame(testDeck, {
        cardIds: [known ?? "", "notInThisDeckAtAll"],
        rng: seededRng(1),
      });
      expect(state.drawPile).toEqual([known]);
    });

    it("still honours teamCount and stays deterministic for a seed", () => {
      const subset = testDeck.cards.map((c) => c.spotifyTrackId);
      const a = createGame(testDeck, {
        cardIds: subset,
        teamCount: 2,
        rng: seededRng(9),
      });
      const b = createGame(testDeck, {
        cardIds: subset,
        teamCount: 2,
        rng: seededRng(9),
      });
      expect(a.timelines).toEqual([[], []]);
      expect(a.drawPile).toEqual(b.drawPile);
    });
  });
});
