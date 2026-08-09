import { describe, expect, it } from "vitest";
import { testDeck } from "@/decks/__fixtures__/testDeck";
import {
  selectHistory,
  selectHistoryEntryForReplay,
  selectPlacement,
  selectRevealedCard,
  selectRoundDisplay,
  selectStartOffsetMs,
  selectTeams,
  selectTrackIdForPlayback,
} from "@/engine/selectors";
import type { GameState, Phase } from "@/engine/types";
import { ALL_PHASES, TARGET_SCORE } from "@/engine/types";

/** A state in `phase`, always with a card in hand, so phase is the only variable. */
function stateIn(phase: Phase): GameState {
  return {
    phase,
    deckId: testDeck.id,
    drawPile: ["track-f"],
    currentCard: "track-c",
    round: 3,
    timelines: [],
    currentTeam: 0,
    lastPlacement: null,
    history: [],
  };
}

/** The same, under the timeline ruleset with a placement already resolved. */
function placedIn(phase: Phase): GameState {
  return {
    ...stateIn(phase),
    timelines: [["track-a"], ["track-d"]],
    currentTeam: 1,
    lastPlacement: { team: 0, slot: 1, correct: false },
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

describe("spoiler gate: selectPlacement", () => {
  const leaky = ALL_PHASES.filter((p) => p !== "revealed");

  it.each(leaky)("returns null in phase %s, even with a placement", (phase) => {
    expect(selectPlacement(placedIn(phase), testDeck)).toBeNull();
  });

  it("reports the outcome once revealed", () => {
    const outcome = selectPlacement(placedIn("revealed"), testDeck);
    expect(outcome?.team).toBe(0);
    expect(outcome?.slot).toBe(1);
    expect(outcome?.correct).toBe(false);
  });

  it("returns null under the paper ruleset, where nothing is placed", () => {
    expect(selectPlacement(stateIn("revealed"), testDeck)).toBeNull();
  });

  it("names every slot a missed card could have gone in", () => {
    // track-c is 1984; team 0's timeline is [1965, 1991], so only slot 1 fits.
    const state = {
      ...placedIn("revealed"),
      timelines: [["track-a", "track-d"], []],
      lastPlacement: { team: 0, slot: 0, correct: false },
    };
    expect(selectPlacement(state, testDeck)?.correctSlots).toEqual([1]);
  });

  /*
   * A tie has two correct slots and the feedback must not present one of them as
   * the answer. track-c (1984) against a timeline holding another 1984 card.
   */
  it("names both slots when the card ties with a neighbour", () => {
    const tieDeck = {
      ...testDeck,
      cards: [
        ...testDeck.cards,
        { spotifyTrackId: "track-twin", year: 1984, title: "Twin", artist: "T" },
      ],
    };
    const state = {
      ...placedIn("revealed"),
      timelines: [["track-twin"], []],
      lastPlacement: { team: 0, slot: 5, correct: false },
    };
    expect(selectPlacement(state, tieDeck)?.correctSlots).toEqual([0, 1]);
  });

  it("names no slots when the placement was right", () => {
    const state = {
      ...placedIn("revealed"),
      timelines: [["track-a", "track-c", "track-d"], []],
      lastPlacement: { team: 0, slot: 1, correct: true },
    };
    expect(selectPlacement(state, testDeck)?.correctSlots).toEqual([]);
  });
});

describe("selectTeams", () => {
  it("returns null under the paper ruleset", () => {
    expect(selectTeams(stateIn("inPlay"), testDeck)).toBeNull();
  });

  it("resolves placed cards for display", () => {
    const teams = selectTeams(placedIn("inPlay"), testDeck);
    expect(teams?.timelines[0]).toEqual([
      { year: 1965, title: "Song A", artist: "Artist A" },
    ]);
    expect(teams?.currentTeam).toBe(1);
    expect(teams?.winner).toBeNull();
  });

  /*
   * The reason this selector exists: a placed card is already revealed and spoils
   * nothing, but handing components a TrackId[] would make IDs-in-props the natural
   * thing to write, and a stray currentCard looks no different from a harmless one.
   */
  it.each([...ALL_PHASES])("puts no track ID in its output in phase %s", (phase) => {
    const serialized = JSON.stringify(selectTeams(placedIn(phase), testDeck));
    expect(serialized).not.toContain("track-a");
    expect(serialized).not.toContain("track-c");
    expect(serialized).not.toContain("track-d");
  });

  it("reports a winner once a team reaches the target", () => {
    const won = Array.from({ length: TARGET_SCORE }, () => "track-a");
    const state = { ...placedIn("inPlay"), timelines: [["track-a"], won] };
    expect(selectTeams(state, testDeck)?.winner).toBe(1);
  });
});

describe("selectHistory", () => {
  it("resolves nothing for a fresh game", () => {
    expect(selectHistory(stateIn("idle"), testDeck)).toEqual([]);
  });

  it("resolves a paper-ruleset reveal with no team or result", () => {
    const state = {
      ...stateIn("revealed"),
      history: [{ trackId: "track-a", team: null, correct: null }],
    };
    expect(selectHistory(state, testDeck)).toEqual([
      { year: 1965, title: "Song A", artist: "Artist A", team: null, correct: null },
    ]);
  });

  it("resolves a timeline-ruleset placement with its team and result", () => {
    const state = {
      ...stateIn("revealed"),
      history: [{ trackId: "track-a", team: 1, correct: false }],
    };
    expect(selectHistory(state, testDeck)).toEqual([
      { year: 1965, title: "Song A", artist: "Artist A", team: 1, correct: false },
    ]);
  });

  it("drops an entry whose track left the deck", () => {
    const state = {
      ...stateIn("revealed"),
      history: [{ trackId: "track-gone", team: null, correct: null }],
    };
    expect(selectHistory(state, testDeck)).toEqual([]);
  });

  it("preserves play order", () => {
    const state = {
      ...stateIn("revealed"),
      history: [
        { trackId: "track-d", team: null, correct: null },
        { trackId: "track-a", team: null, correct: null },
      ],
    };
    expect(selectHistory(state, testDeck).map((e) => e.title)).toEqual([
      "Song D",
      "Song A",
    ]);
  });

  /*
   * An entry only exists because REVEAL already put this same title/artist/year on
   * screen, so unlike the spoiler-gated selectors above, there is nothing left here
   * to hide in any phase — the same reasoning as selectTeams.
   */
  it.each([...ALL_PHASES])("puts no track ID in its output in phase %s", (phase) => {
    const state = {
      ...stateIn(phase),
      history: [{ trackId: "track-a", team: 0, correct: true }],
    };
    const serialized = JSON.stringify(selectHistory(state, testDeck));
    expect(serialized).not.toContain("track-a");
  });
});

describe("selectHistoryEntryForReplay", () => {
  const withHistory = {
    ...stateIn("finished"),
    history: [{ trackId: "track-a", team: null, correct: null }],
  };

  it("returns the track ID and start offset for a past entry", () => {
    expect(selectHistoryEntryForReplay(withHistory, testDeck, 0)).toEqual({
      trackId: "track-a",
      startOffsetMs: 0,
    });
  });

  it("returns null for an out-of-range index", () => {
    expect(selectHistoryEntryForReplay(withHistory, testDeck, 1)).toBeNull();
  });

  it("returns null when the entry's track left the deck", () => {
    const state = {
      ...stateIn("finished"),
      history: [{ trackId: "track-gone", team: null, correct: null }],
    };
    expect(selectHistoryEntryForReplay(state, testDeck, 0)).toBeNull();
  });

  // The deliberate hole: unlike selectHistory's display data, this exists purely to
  // hand a track ID to the playback adapter, and it works regardless of phase since
  // every entry it can return was already revealed to players earlier in the game.
  it.each([...ALL_PHASES])("is unaffected by phase %s", (phase) => {
    const state = { ...withHistory, phase };
    expect(selectHistoryEntryForReplay(state, testDeck, 0)?.trackId).toBe("track-a");
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
