import { describe, expect, it } from "vitest";
import { testDeck } from "@/decks/__fixtures__/testDeck";
import { createGame } from "@/engine/createGame";
import { reduce } from "@/engine/reduce";
import { seededRng } from "@/engine/testUtils";
import type { GameState } from "@/engine/types";

const newGame = () => createGame(testDeck, seededRng(1));
const draw = (s: GameState) => reduce(s, { type: "DRAW" });
const reveal = (s: GameState) => reduce(s, { type: "REVEAL" });

describe("reduce — DRAW", () => {
  it("starts the first song", () => {
    const state = draw(newGame());
    expect(state.phase).toBe("inPlay");
    expect(state.currentCard).not.toBeNull();
    expect(state.round).toBe(1);
    expect(state.drawPile).toHaveLength(testDeck.cards.length - 1);
  });

  it("deals every card exactly once, then finishes", () => {
    let state = newGame();
    const drawn: string[] = [];

    for (let i = 0; i < testDeck.cards.length; i++) {
      state = draw(state);
      expect(state.phase).toBe("inPlay");
      // biome-ignore lint/style/noNonNullAssertion: phase inPlay implies a card
      drawn.push(state.currentCard!);
    }

    expect(new Set(drawn).size).toBe(testDeck.cards.length);

    // One draw past the end of the deck.
    state = draw(state);
    expect(state.phase).toBe("finished");
    expect(state.currentCard).toBeNull();
  });

  it("advances from revealed — the same button is Start and Next song", () => {
    const first = reveal(draw(newGame()));
    expect(first.phase).toBe("revealed");

    const second = draw(first);
    expect(second.phase).toBe("inPlay");
    expect(second.round).toBe(2);
    expect(second.currentCard).not.toBe(first.currentCard);
  });

  it("advances from inPlay without revealing — abandoning an unplaceable card", () => {
    const first = draw(newGame());
    const second = draw(first);
    expect(second.phase).toBe("inPlay");
    expect(second.round).toBe(2);
    expect(second.currentCard).not.toBe(first.currentCard);
  });

  it("is a no-op once finished, returning the same reference", () => {
    let state = newGame();
    for (let i = 0; i <= testDeck.cards.length; i++) state = draw(state);
    expect(state.phase).toBe("finished");
    expect(draw(state)).toBe(state);
  });
});

describe("reduce — REVEAL", () => {
  it("reveals a card that is in play", () => {
    const state = reveal(draw(newGame()));
    expect(state.phase).toBe("revealed");
  });

  it("keeps the card and round unchanged", () => {
    const before = draw(newGame());
    const after = reveal(before);
    expect(after.currentCard).toBe(before.currentCard);
    expect(after.round).toBe(before.round);
    expect(after.drawPile).toEqual(before.drawPile);
  });

  // A stale click must never crash the party — hence no-op rather than throw.
  it("is a no-op outside inPlay, returning the same reference", () => {
    const idle = newGame();
    expect(reveal(idle)).toBe(idle);

    const revealed = reveal(draw(idle));
    expect(reveal(revealed)).toBe(revealed);

    let finished = idle;
    for (let i = 0; i <= testDeck.cards.length; i++) finished = draw(finished);
    expect(reveal(finished)).toBe(finished);
  });
});

describe("reduce — purity", () => {
  it("does not mutate the state it is given", () => {
    const state = draw(newGame());
    const snapshot = structuredClone(state);
    reveal(state);
    draw(state);
    expect(state).toEqual(snapshot);
  });
});
