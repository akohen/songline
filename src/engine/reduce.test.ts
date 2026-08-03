import { describe, expect, it } from "vitest";
import { testDeck } from "@/decks/__fixtures__/testDeck";
import type { Deck } from "@/decks/types";
import { createGame } from "@/engine/createGame";
import { reduce } from "@/engine/reduce";
import { seededRng } from "@/engine/testUtils";
import type { GameState } from "@/engine/types";
import { TARGET_SCORE } from "@/engine/types";

const newGame = () => createGame(testDeck, { rng: seededRng(1) });
const draw = (s: GameState) => reduce(s, { type: "DRAW" }, testDeck);
const reveal = (s: GameState) => reduce(s, { type: "REVEAL" }, testDeck);

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

// ---------------------------------------------------------------------------
// The timeline ruleset. See docs/product/timeline-ruleset.md.
// ---------------------------------------------------------------------------

/**
 * A deck with a deliberate tie — 1984 twice — because the shared fixture has none and
 * "a tie has two correct slots" is the rule most easily got wrong.
 */
const tieDeck: Deck = {
  ...testDeck,
  cards: [
    { spotifyTrackId: "old", year: 1965, title: "Old", artist: "A" },
    { spotifyTrackId: "mid", year: 1984, title: "Mid", artist: "B" },
    { spotifyTrackId: "twin", year: 1984, title: "Twin", artist: "C" },
    { spotifyTrackId: "new", year: 2016, title: "New", artist: "D" },
  ],
};

/** A state built by hand, so the card in play and the timeline are both known. */
function stateWith(over: Partial<GameState> = {}): GameState {
  return {
    phase: "inPlay",
    deckId: tieDeck.id,
    drawPile: [],
    currentCard: "mid",
    round: 1,
    timelines: [[]],
    currentTeam: 0,
    lastPlacement: null,
    ...over,
  };
}

const place = (s: GameState, slot: number, deck = tieDeck) =>
  reduce(s, { type: "REVEAL", slot }, deck);

describe("timeline ruleset — the two rulesets stay apart", () => {
  it("ignores a placement under the paper ruleset", () => {
    const state = draw(newGame());
    expect(state.timelines).toEqual([]);
    expect(reduce(state, { type: "REVEAL", slot: 0 }, testDeck)).toBe(state);
  });

  it("ignores a plain reveal under the timeline ruleset", () => {
    // A card nobody placed is abandoned with Skip, never revealed.
    const state = stateWith();
    expect(reduce(state, { type: "REVEAL" }, tieDeck)).toBe(state);
  });
});

describe("timeline ruleset — seeding", () => {
  const seededGame = (teamCount: number) =>
    createGame(testDeck, { teamCount, rng: seededRng(1) });

  it("deals one card per team off the pile before the first song", () => {
    const state = draw(seededGame(3));
    expect(state.timelines.map((t) => t.length)).toEqual([1, 1, 1]);
    // Three seeds and the card now playing.
    expect(state.drawPile).toHaveLength(testDeck.cards.length - 4);
  });

  it("gives every team a different seed, and none of them is the card in play", () => {
    const state = draw(seededGame(3));
    const seeds = state.timelines.flat();
    expect(new Set(seeds).size).toBe(3);
    expect(seeds).not.toContain(state.currentCard);
  });

  it("does not seed under the paper ruleset", () => {
    expect(draw(newGame()).timelines).toEqual([]);
  });

  it("does not seed twice", () => {
    const first = draw(seededGame(2));
    const second = draw(first);
    expect(second.timelines.map((t) => t.length)).toEqual([1, 1]);
  });

  /**
   * The regression that motivates keying on empty timelines rather than `round === 0`:
   * a restore rolls the in-flight card back and decrements `round`, so a game saved in
   * round one comes back at zero with its seeds already dealt.
   */
  it("does not re-seed a restored game sitting at round 0", () => {
    const restored = stateWith({
      phase: "idle",
      round: 0,
      currentCard: null,
      drawPile: ["twin", "new"],
      timelines: [["old"], ["mid"]],
      currentTeam: 1,
    });

    const state = reduce(restored, { type: "DRAW" }, tieDeck);
    expect(state.timelines).toEqual([["old"], ["mid"]]);
    expect(state.currentCard).toBe("twin");
  });
});

describe("timeline ruleset — placement", () => {
  it("inserts a correct card at the chosen slot", () => {
    const state = place(stateWith({ timelines: [["old", "new"]] }), 1);
    expect(state.phase).toBe("revealed");
    expect(state.timelines[0]).toEqual(["old", "mid", "new"]);
    expect(state.lastPlacement).toEqual({ team: 0, slot: 1, correct: true });
  });

  it("discards a wrong card — nothing is added anywhere", () => {
    const before = stateWith({ timelines: [["old", "new"]] });
    const state = place(before, 2); // after 2016, but the card is 1984
    expect(state.phase).toBe("revealed");
    expect(state.timelines[0]).toEqual(["old", "new"]);
    expect(state.lastPlacement).toEqual({ team: 0, slot: 2, correct: false });
  });

  it("accepts a tie on either side of its equal-year neighbour", () => {
    // "twin" is 1984 and so is the "mid" already placed; both slots are correct.
    const base = stateWith({ currentCard: "twin", timelines: [["old", "mid", "new"]] });
    expect(place(base, 1).lastPlacement?.correct).toBe(true);
    expect(place(base, 2).lastPlacement?.correct).toBe(true);
    expect(place(base, 1).timelines[0]).toEqual(["old", "twin", "mid", "new"]);
    expect(place(base, 2).timelines[0]).toEqual(["old", "mid", "twin", "new"]);
  });

  it("treats the bounds as inclusive at both ends", () => {
    // Equal to its only neighbour, from both directions.
    const before = stateWith({ currentCard: "twin", timelines: [["mid"]] });
    expect(place(before, 0).lastPlacement?.correct).toBe(true);
    expect(place(before, 1).lastPlacement?.correct).toBe(true);
  });

  it("places into the current team's timeline only", () => {
    const before = stateWith({ timelines: [["old"], ["new"]], currentTeam: 1 });
    const state = place(before, 0);
    expect(state.timelines[0]).toEqual(["old"]);
    expect(state.timelines[1]).toEqual(["mid", "new"]);
  });
});

describe("timeline ruleset — turns", () => {
  it("advances the turn when a card is placed, right or wrong", () => {
    const before = stateWith({ timelines: [[], [], []], currentTeam: 1 });
    expect(place(before, 0).currentTeam).toBe(2);

    // "mid" is 1984 and slot 1 is after "new" (2016) — a wrong guess still ends the
    // turn, because the card is spent either way.
    const wrong = stateWith({ timelines: [["new"], [], ["new"]], currentTeam: 2 });
    expect(place(wrong, 1).lastPlacement?.correct).toBe(false);
    expect(place(wrong, 1).currentTeam).toBe(0); // wraps
  });

  it("does not advance the turn on a skip — the same team plays again", () => {
    const before = stateWith({
      timelines: [["old"], ["new"]],
      currentTeam: 1,
      drawPile: ["twin"],
    });
    // Skip is a DRAW with no placement in between.
    expect(reduce(before, { type: "DRAW" }, tieDeck).currentTeam).toBe(1);
  });
});

/** Enough cards, with ascending years, to actually reach the target of 10. */
const bigDeck: Deck = {
  ...testDeck,
  cards: Array.from({ length: 12 }, (_, i) => ({
    spotifyTrackId: `b${i}`,
    year: 1950 + i * 5,
    title: `Track ${i}`,
    artist: `Artist ${i}`,
  })),
};

const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `b${i + from}`);

describe("timeline ruleset — victory", () => {
  it("does not end the game on the winning placement, so it can be revealed", () => {
    // Nine placed, and b11 (2005) is the newest card, so the end slot is correct.
    const before = stateWith({ currentCard: "b11", timelines: [ids(9)] });
    const state = reduce(before, { type: "REVEAL", slot: 9 }, bigDeck);

    expect(state.lastPlacement?.correct).toBe(true);
    expect(state.timelines[0]).toHaveLength(TARGET_SCORE);
    // Crucially still revealed, not finished — the winning card gets its moment.
    expect(state.phase).toBe("revealed");
  });

  it("finishes on the next draw, without consuming a card", () => {
    const won = stateWith({
      phase: "revealed",
      timelines: [ids(TARGET_SCORE)],
      drawPile: ["b10", "b11"],
    });
    const state = reduce(won, { type: "DRAW" }, bigDeck);

    expect(state.phase).toBe("finished");
    expect(state.currentCard).toBeNull();
    expect(state.drawPile).toEqual(["b10", "b11"]);
  });
});

describe("timeline ruleset — totality", () => {
  const inPlay = stateWith({ timelines: [["old", "new"]] });

  it.each([
    ["a slot past the end", 3],
    ["a negative slot", -1],
    ["a fractional slot", 1.5],
  ])("is a no-op for %s", (_label, slot) => {
    expect(place(inPlay, slot)).toBe(inPlay);
  });

  it.each(["idle", "revealed", "finished"] as const)(
    "is a no-op for a placement in phase %s",
    (phase) => {
      const state = stateWith({ phase, timelines: [["old"]] });
      expect(place(state, 0)).toBe(state);
    },
  );

  it("is a no-op when the card in play is not in the deck", () => {
    const state = stateWith({ currentCard: "gone", timelines: [["old"]] });
    expect(place(state, 0)).toBe(state);
  });

  it("is a no-op when a placed card is not in the deck", () => {
    const state = stateWith({ timelines: [["gone"]] });
    expect(place(state, 0)).toBe(state);
  });
});
