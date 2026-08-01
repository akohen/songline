import { describe, expect, it } from "vitest";
import { testDeck } from "@/decks/__fixtures__/testDeck";
import type { Deck } from "@/decks/types";
import { createGame } from "@/engine/createGame";
import { deserialize, serialize } from "@/engine/persistence";
import { reduce } from "@/engine/reduce";
import { seededRng } from "@/engine/testUtils";
import type { GameState } from "@/engine/types";

const midGame = (): GameState => {
  const started = reduce(createGame(testDeck, seededRng(5)), { type: "DRAW" });
  return reduce(started, { type: "REVEAL" });
};

describe("serialize / deserialize", () => {
  it("round-trips a game in progress", () => {
    const state = midGame();
    expect(deserialize(serialize(state), testDeck)).toEqual(state);
  });

  it("round-trips a fresh game", () => {
    const state = createGame(testDeck, seededRng(9));
    expect(deserialize(serialize(state), testDeck)).toEqual(state);
  });
});

describe("deserialize — rejects, meaning start fresh", () => {
  it("returns null on unparseable JSON", () => {
    expect(deserialize("{not json", testDeck)).toBeNull();
  });

  it("returns null on a schema version mismatch", () => {
    const raw = JSON.stringify({ version: 99, state: midGame() });
    expect(deserialize(raw, testDeck)).toBeNull();
  });

  it("returns null when the saved game is for a different deck", () => {
    const other: Deck = { ...testDeck, id: "some-other-deck" };
    expect(deserialize(serialize(midGame()), other)).toBeNull();
  });

  it("returns null on a malformed state", () => {
    const raw = JSON.stringify({ version: 1, state: { phase: "inPlay" } });
    expect(deserialize(raw, testDeck)).toBeNull();
  });

  it("returns null on an unknown phase", () => {
    const raw = JSON.stringify({
      version: 1,
      state: { ...midGame(), phase: "somethingElse" },
    });
    expect(deserialize(raw, testDeck)).toBeNull();
  });
});

// A deck edited between sessions is the realistic case here, not corruption.
describe("deserialize — deck rot", () => {
  it("drops pile entries no longer in the deck", () => {
    const state: GameState = {
      phase: "inPlay",
      deckId: testDeck.id,
      drawPile: ["track-a", "track-removed", "track-b"],
      currentCard: "track-c",
      round: 2,
    };

    const restored = deserialize(serialize(state), testDeck);
    expect(restored?.drawPile).toEqual(["track-a", "track-b"]);
    expect(restored?.currentCard).toBe("track-c");
    expect(restored?.phase).toBe("inPlay");
  });

  it("falls back to idle when the in-play card itself is gone", () => {
    const state: GameState = {
      phase: "revealed",
      deckId: testDeck.id,
      drawPile: ["track-a"],
      currentCard: "track-removed",
      round: 4,
    };

    const restored = deserialize(serialize(state), testDeck);
    expect(restored?.phase).toBe("idle");
    expect(restored?.currentCard).toBeNull();
    expect(restored?.drawPile).toEqual(["track-a"]);
    expect(restored?.round).toBe(4);
  });
});
