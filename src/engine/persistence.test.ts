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
  it("round-trips a fresh game unchanged", () => {
    const state = createGame(testDeck, seededRng(9));
    expect(deserialize(serialize(state), testDeck)).toEqual(state);
  });

  it("preserves the deck and the remaining songs", () => {
    const state = midGame();
    const restored = deserialize(serialize(state), testDeck);
    expect(restored?.deckId).toBe(testDeck.id);
    expect(restored?.drawPile).toHaveLength(testDeck.cards.length);
  });
});

/*
 * Audio does not survive a reload: the SDK holds nothing and playback cannot restart
 * without a user gesture. Restoring mid-card would show a card nobody can hear, and
 * restoring after a reveal would put the answer on screen the moment the game
 * reopened — which is exactly what happened before this behaviour existed.
 */
describe("deserialize — always resumes at idle", () => {
  it("returns to idle from a revealed save, hiding the answer", () => {
    const restored = deserialize(serialize(midGame()), testDeck);
    expect(restored?.phase).toBe("idle");
    expect(restored?.currentCard).toBeNull();
  });

  it("returns to idle from an in-play save", () => {
    const inPlay = reduce(createGame(testDeck, seededRng(5)), { type: "DRAW" });
    const restored = deserialize(serialize(inPlay), testDeck);
    expect(restored?.phase).toBe("idle");
    expect(restored?.currentCard).toBeNull();
  });

  it("consumes nothing: the in-flight card returns to the front of the pile", () => {
    const inPlay = reduce(createGame(testDeck, seededRng(5)), { type: "DRAW" });
    const restored = deserialize(serialize(inPlay), testDeck);

    expect(restored?.drawPile[0]).toBe(inPlay.currentCard);
    expect(restored?.drawPile).toHaveLength(testDeck.cards.length);
    // The round counter is rolled back with it, so the next Start is round 1 again.
    expect(restored?.round).toBe(0);
  });

  it("stays finished when the deck was exhausted", () => {
    let state = createGame(testDeck, seededRng(2));
    for (let i = 0; i <= testDeck.cards.length; i++) {
      state = reduce(state, { type: "DRAW" });
    }
    expect(state.phase).toBe("finished");
    expect(deserialize(serialize(state), testDeck)?.phase).toBe("finished");
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
    // track-removed is gone; track-c comes back to the front to be replayed.
    expect(restored?.drawPile).toEqual(["track-c", "track-a", "track-b"]);
    expect(restored?.round).toBe(1);
  });

  it("does not resurrect an in-play card that left the deck", () => {
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
    // That round genuinely happened, so the counter is not rolled back here.
    expect(restored?.round).toBe(4);
  });
});
