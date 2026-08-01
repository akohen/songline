import { describe, expect, it } from "vitest";
import { testDeck } from "@/decks/__fixtures__/testDeck";
import type { Deck } from "@/decks/types";
import { createGame } from "@/engine/createGame";
import { deserialize, serialize } from "@/engine/persistence";
import { reduce } from "@/engine/reduce";
import { seededRng } from "@/engine/testUtils";
import type { GameState } from "@/engine/types";

/** A minimal valid state to spread over, so each test states only what it varies. */
const blank: GameState = {
  phase: "idle",
  deckId: testDeck.id,
  drawPile: [],
  currentCard: null,
  round: 0,
  timelines: [],
  currentTeam: 0,
  lastPlacement: null,
};

const midGame = (): GameState => {
  const started = reduce(
    createGame(testDeck, { rng: seededRng(5) }),
    { type: "DRAW" },
    testDeck,
  );
  return reduce(started, { type: "REVEAL" }, testDeck);
};

describe("serialize / deserialize", () => {
  it("round-trips a fresh game unchanged", () => {
    const state = createGame(testDeck, { rng: seededRng(9) });
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
    const inPlay = reduce(
      createGame(testDeck, { rng: seededRng(5) }),
      { type: "DRAW" },
      testDeck,
    );
    const restored = deserialize(serialize(inPlay), testDeck);
    expect(restored?.phase).toBe("idle");
    expect(restored?.currentCard).toBeNull();
  });

  it("consumes nothing: the in-flight card returns to the front of the pile", () => {
    const inPlay = reduce(
      createGame(testDeck, { rng: seededRng(5) }),
      { type: "DRAW" },
      testDeck,
    );
    const restored = deserialize(serialize(inPlay), testDeck);

    expect(restored?.drawPile[0]).toBe(inPlay.currentCard);
    expect(restored?.drawPile).toHaveLength(testDeck.cards.length);
    // The round counter is rolled back with it, so the next Start is round 1 again.
    expect(restored?.round).toBe(0);
  });

  it("stays finished when the deck was exhausted", () => {
    let state = createGame(testDeck, { rng: seededRng(2) });
    for (let i = 0; i <= testDeck.cards.length; i++) {
      state = reduce(state, { type: "DRAW" }, testDeck);
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
    const raw = JSON.stringify({ version: 2, state: { phase: "inPlay" } });
    expect(deserialize(raw, testDeck)).toBeNull();
  });

  it("returns null on an unknown phase", () => {
    const raw = JSON.stringify({
      version: 2,
      state: { ...midGame(), phase: "somethingElse" },
    });
    expect(deserialize(raw, testDeck)).toBeNull();
  });

  // Version 1 predates teams, so its saves have no timelines to restore.
  it("returns null on a version 1 save", () => {
    const { timelines, currentTeam, lastPlacement, ...v1 } = midGame();
    expect(deserialize(JSON.stringify({ version: 1, state: v1 }), testDeck)).toBeNull();
  });

  it("returns null when timelines are missing from a version 2 save", () => {
    const { timelines, ...withoutTimelines } = midGame();
    const raw = JSON.stringify({ version: 2, state: withoutTimelines });
    expect(deserialize(raw, testDeck)).toBeNull();
  });
});

// A deck edited between sessions is the realistic case here, not corruption.
describe("deserialize — deck rot", () => {
  it("drops pile entries no longer in the deck", () => {
    const state: GameState = {
      ...blank,
      phase: "inPlay",
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
      ...blank,
      phase: "revealed",
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

  /*
   * Deliberately stricter than the draw pile above. Dropping an unplayed card costs
   * nobody anything; dropping a *placed* one silently changes that team's score, and a
   * game whose standings moved under the players is worse than a lost save.
   */
  it("refuses the whole save when a placed card left the deck", () => {
    const state: GameState = {
      ...blank,
      timelines: [["track-a"], ["track-removed"]],
    };
    expect(deserialize(serialize(state), testDeck)).toBeNull();
  });
});

describe("deserialize — teams survive a reload", () => {
  const played: GameState = {
    ...blank,
    phase: "revealed",
    drawPile: ["track-d", "track-e"],
    currentCard: "track-f",
    round: 3,
    timelines: [["track-a", "track-c"], ["track-b"]],
    currentTeam: 1,
    lastPlacement: { team: 0, slot: 1, correct: true },
  };

  it("keeps timelines, scores and whose turn it is", () => {
    const restored = deserialize(serialize(played), testDeck);
    expect(restored?.timelines).toEqual([["track-a", "track-c"], ["track-b"]]);
    expect(restored?.currentTeam).toBe(1);
  });

  /*
   * `lastPlacement` is reveal output and the game resumes before the reveal. Left set,
   * the round screen would render an outcome for a card nobody is playing.
   */
  it("clears the last placement, which belongs to a card no longer in play", () => {
    expect(deserialize(serialize(played), testDeck)?.lastPlacement).toBeNull();
    expect(deserialize(serialize(played), testDeck)?.phase).toBe("idle");
  });
});
