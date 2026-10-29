import { describe, expect, it } from "vitest";
import { testDeck } from "@/decks/__fixtures__/testDeck";
import { DECKS, getDeck } from "@/decks/loadDeck";
import type { Deck } from "@/decks/types";
import { createGame } from "@/engine/createGame";
import { reduce } from "@/engine/reduce";
import { seededRng } from "@/engine/testUtils";
import type { GameState } from "@/engine/types";
import { crc8, decodeSnapshot, encodeSnapshot } from "@/sync/codec";

// biome-ignore lint/style/noNonNullAssertion: the 308-card deck is bundled
const rock = getDeck("hitster-rock")!;
const decks: readonly Deck[] = [testDeck, ...DECKS];

/** What a viewer can legitimately know: no pile, no history, the card only at reveal. */
function viewOf(state: GameState): GameState {
  const revealed = state.phase === "revealed";
  return {
    ...state,
    drawPile: [],
    history: [],
    currentCard: revealed ? state.currentCard : null,
    lastPlacement: revealed ? state.lastPlacement : null,
  };
}

function roundTrip(state: GameState) {
  const bytes = encodeSnapshot(state, decks);
  expect(bytes).not.toBeNull();
  // biome-ignore lint/style/noNonNullAssertion: asserted just above
  return decodeSnapshot(bytes!, decks);
}

/** Plays real rounds through the reducer, placing at random so some miss. */
function play(deck: Deck, teamCount: number, rounds: number, seed: number) {
  const rng = seededRng(seed);
  let state = createGame(deck, { teamCount, rng });
  const seen: GameState[] = [state];
  for (let i = 0; i < rounds && state.phase !== "finished"; i++) {
    state = reduce(state, { type: "DRAW" }, deck);
    seen.push(state);
    if (state.phase !== "inPlay") break;
    const length = state.timelines[state.currentTeam]?.length ?? 0;
    const slot = Math.floor(rng() * (length + 1));
    state = reduce(state, { type: "REVEAL", slot }, deck);
    seen.push(state);
  }
  return seen;
}

describe("encodeSnapshot / decodeSnapshot", () => {
  describe.each([1, 2, 3, 4])("%i team(s) on the 308-card deck", (teams) => {
    const states = play(rock, teams, 40, teams * 7);

    it("covers idle, inPlay and revealed", () => {
      const phases = new Set(states.map((s) => s.phase));
      expect(phases).toContain("idle");
      expect(phases).toContain("inPlay");
      expect(phases).toContain("revealed");
    });

    it("round-trips every state the game passed through", () => {
      for (const state of states) {
        const decoded = roundTrip(state);
        expect(decoded).toEqual({ ok: true, deck: rock, state: viewOf(state) });
      }
    });
  });

  it("round-trips a finished game", () => {
    const states = play(testDeck, 2, 20, 3);
    const finished = states.at(-1);
    expect(finished?.phase).toBe("finished");
    // biome-ignore lint/style/noNonNullAssertion: asserted just above
    expect(roundTrip(finished!)).toEqual({
      ok: true,
      deck: testDeck,
      // biome-ignore lint/style/noNonNullAssertion: asserted just above
      state: viewOf(finished!),
    });
  });

  it("refuses a game without teams — songs only is never broadcast", () => {
    expect(encodeSnapshot(createGame(rock), decks)).toBeNull();
  });
});

describe("spoiler gate", () => {
  const inPlay = play(rock, 2, 5, 11).filter((s) => s.phase === "inPlay");

  it("an in-play snapshot carries no trace of the current card", () => {
    expect(inPlay.length).toBeGreaterThan(0);
    for (const state of inPlay) {
      const other = rock.cards.find((c) => c.spotifyTrackId !== state.currentCard);
      const swapped = { ...state, currentCard: other?.spotifyTrackId ?? null };
      const cleared = { ...state, currentCard: null };
      expect(encodeSnapshot(state, decks)).not.toBeNull();
      // Same bytes whatever the card is, or whether there is one at all: there is no
      // field for it to occupy.
      expect(encodeSnapshot(swapped, decks)).toEqual(encodeSnapshot(state, decks));
      expect(encodeSnapshot(cleared, decks)).toEqual(encodeSnapshot(state, decks));
    }
  });

  it("decodes an in-play snapshot with no current card", () => {
    for (const state of inPlay) {
      const decoded = roundTrip(state);
      expect(decoded.ok && decoded.state.currentCard).toBeNull();
    }
  });
});

describe("tied years", () => {
  const tie = rock.cards
    .map((card) => rock.cards.filter((other) => other.year === card.year))
    .find((cards) => cards.length >= 2);

  it.each([false, true])("keep their recorded order (reversed: %s)", (reversed) => {
    expect(tie).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: asserted just above
    const [first, second] = tie!.map((c) => c.spotifyTrackId);
    // biome-ignore lint/style/noNonNullAssertion: a tie has two cards
    const pair = reversed ? [second!, first!] : [first!, second!];
    const state: GameState = {
      ...createGame(rock, { teamCount: 1 }),
      phase: "inPlay",
      round: 2,
      timelines: [pair],
    };
    const decoded = roundTrip(state);
    expect(decoded.ok && decoded.state.timelines).toEqual([pair]);
  });
});

describe("rejection", () => {
  const state = play(rock, 3, 6, 5).at(-1) as GameState;
  const bytes = encodeSnapshot(state, decks) as Uint8Array;

  /** Rewrites the CRC so only the change under test can be what is rejected. */
  function forged(edit: (body: Uint8Array) => void): Uint8Array {
    const body = bytes.slice(0, -1);
    edit(body);
    return Uint8Array.from([...body, crc8(body)]);
  }

  it("rejects a bad CRC as corrupt", () => {
    const flipped = bytes.slice();
    flipped[3] = (flipped[3] ?? 0) ^ 0x10;
    expect(decodeSnapshot(flipped, decks)).toEqual({ ok: false, reason: "corrupt" });

    const badCrc = bytes.slice();
    badCrc[badCrc.length - 1] = (badCrc[badCrc.length - 1] ?? 0) ^ 0x01;
    expect(decodeSnapshot(badCrc, decks)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("rejects a truncated or padded packet as corrupt", () => {
    expect(decodeSnapshot(forged(() => {}).subarray(0, 5), decks).ok).toBe(false);
    const padded = Uint8Array.from([...bytes.slice(0, -1), 0]);
    expect(decodeSnapshot(Uint8Array.from([...padded, crc8(padded)]), decks)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("rejects another version as incompatible", () => {
    const other = forged((body) => {
      body[0] = ((body[0] ?? 0) & 0x0f) | (2 << 4);
    });
    expect(decodeSnapshot(other, decks)).toEqual({ ok: false, reason: "incompatible" });
  });

  it("rejects a deck whose cards differ as incompatible", () => {
    const edited = decks.map((deck) =>
      deck.id === rock.id ? { ...deck, cards: [...deck.cards].reverse() } : deck,
    );
    expect(decodeSnapshot(bytes, edited)).toEqual({ ok: false, reason: "incompatible" });
  });

  it("rejects a deck index this build does not have as incompatible", () => {
    expect(decodeSnapshot(bytes, [testDeck])).toEqual({
      ok: false,
      reason: "incompatible",
    });
  });
});

describe("size", () => {
  it("keeps the largest real game well under ggwave's 140-byte limit", () => {
    // The game ends the moment a team reaches 10, so 10 + 9 + 9 + 9 placed cards is as
    // large as four timelines get — and a reveal adds the card being shown.
    const ids = rock.cards.map((c) => c.spotifyTrackId);
    const [a, b, c, d] = [10, 9, 9, 9].map((n, team) =>
      ids.slice(team * 10, team * 10 + n),
    );
    const state: GameState = {
      ...createGame(rock, { teamCount: 4 }),
      phase: "revealed",
      round: 300,
      timelines: [a, b, c, d] as string[][],
      currentTeam: 1,
      currentCard: ids[0] ?? null,
      lastPlacement: { team: 0, slot: 0, correct: true },
    };
    const bytes = encodeSnapshot(state, decks);
    expect(bytes).not.toBeNull();
    expect(bytes?.length).toBeLessThanOrEqual(55);
    expect(decodeSnapshot(bytes as Uint8Array, decks)).toEqual({
      ok: true,
      deck: rock,
      state: viewOf(state),
    });
  });
});
