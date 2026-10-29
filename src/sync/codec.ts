import type { Deck, TrackId } from "@/decks/types";
import type { GameState, Phase, Timeline } from "@/engine";

/**
 * Game snapshots as bytes, for the ultrasonic broadcast. Pure: no I/O, no audio.
 *
 * Every packet is the whole picture a viewer displays, never a delta — a lost packet or
 * a late joiner is repaired by the next one, and nothing on a viewer has to replay the
 * draw pile. The layout is documented field by field in docs/tech/sound-sync.md; keep
 * the two in step.
 */

/** Bump on any layout change. A viewer rejects every other version as incompatible. */
export const SNAPSHOT_VERSION = 1;

/** Wire order, fixed. Deliberately not `ALL_PHASES`, which may be reordered freely. */
const WIRE_PHASES: readonly Phase[] = ["idle", "inPlay", "revealed", "finished"];

const VERSION_BITS = 4;
const PHASE_BITS = 2;
const TEAM_BITS = 3;
const DECK_INDEX_BITS = 8;
const DECK_HASH_BITS = 8;
const ROUND_BITS = 16;
const SLOT_BITS = 5;
const LENGTH_BITS = 5;

/** CRC-8, polynomial 0x07. Exported for tests that forge packets. */
export function crc8(bytes: Iterable<number>): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte & 0xff;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

/**
 * One byte that changes when the deck's cards or their order change.
 *
 * Card indices only mean something against the exact deck the host has. A viewer on an
 * older build would otherwise resolve every index to whatever card sits there now and
 * show the wrong songs with complete confidence.
 */
export function deckHash(deck: Deck): number {
  const text = [deck.id, ...deck.cards.map((card) => card.spotifyTrackId)].join("\n");
  const codes: number[] = [];
  for (let i = 0; i < text.length; i++) codes.push(text.charCodeAt(i));
  return crc8(codes);
}

/** Bits per card index. 308 cards need 9, which is why a byte per card is not enough. */
function indexBits(deck: Deck): number {
  return Math.max(1, Math.ceil(Math.log2(deck.cards.length)));
}

class BitWriter {
  private bits: number[] = [];

  write(value: number, width: number): void {
    for (let bit = width - 1; bit >= 0; bit--) this.bits.push((value >>> bit) & 1);
  }

  bytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) byte = (byte << 1) | (this.bits[i + bit] ?? 0);
      out.push(byte);
    }
    return out;
  }
}

class BitReader {
  private position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  /** Null once the stream runs out, so a short packet reads as corrupt, never as zeros. */
  read(width: number): number | null {
    if (this.position + width > this.bytes.length * 8) return null;
    let value = 0;
    for (let i = 0; i < width; i++) {
      const byte = this.bytes[(this.position + i) >> 3] ?? 0;
      value = value * 2 + ((byte >> (7 - ((this.position + i) & 7))) & 1);
    }
    this.position += width;
    return value;
  }

  get bytesConsumed(): number {
    return Math.ceil(this.position / 8);
  }
}

/**
 * Encode what a viewer should display, or null if this state cannot be broadcast — no
 * teams, an unknown deck, or a field too large for its slot. Null means "send nothing",
 * never a truncated picture.
 */
export function encodeSnapshot(
  state: GameState,
  decks: readonly Deck[],
): Uint8Array | null {
  const deckIndex = decks.findIndex((deck) => deck.id === state.deckId);
  const deck = decks[deckIndex];
  if (deck === undefined || deckIndex >= 1 << DECK_INDEX_BITS) return null;

  const teams = state.timelines.length;
  if (teams < 1 || teams >= 1 << TEAM_BITS) return null;
  if (state.currentTeam < 0 || state.currentTeam >= teams) return null;
  if (state.round < 0 || state.round >= 1 << ROUND_BITS) return null;

  const indexOf = new Map(deck.cards.map((card, index) => [card.spotifyTrackId, index]));
  const bits = indexBits(deck);

  const out = new BitWriter();
  out.write(SNAPSHOT_VERSION, VERSION_BITS);
  out.write(WIRE_PHASES.indexOf(state.phase), PHASE_BITS);
  out.write(teams, TEAM_BITS);
  out.write(state.currentTeam, TEAM_BITS);
  out.write(deckIndex, DECK_INDEX_BITS);
  out.write(deckHash(deck), DECK_HASH_BITS);
  out.write(state.round, ROUND_BITS);

  // THE spoiler gate, on the wire. `currentCard` is read here and nowhere else, and
  // only once the host has revealed it: an in-play packet has no field for the card at
  // all, so no viewer — and no bug in one — can be handed the answer early.
  if (state.phase === "revealed") {
    const card = state.currentCard === null ? undefined : indexOf.get(state.currentCard);
    const placement = state.lastPlacement;
    if (card === undefined || placement === null) return null;
    if (placement.team < 0 || placement.team >= teams) return null;
    if (placement.slot < 0 || placement.slot >= 1 << SLOT_BITS) return null;
    out.write(card, bits);
    out.write(placement.team, TEAM_BITS);
    out.write(placement.slot, SLOT_BITS);
    out.write(placement.correct ? 1 : 0, 1);
  }

  for (const timeline of state.timelines) {
    if (timeline.length >= 1 << LENGTH_BITS) return null;
    out.write(timeline.length, LENGTH_BITS);
    // Recorded order, never sorted: tied years sit in the order the players chose.
    for (const id of timeline) {
      const index = indexOf.get(id);
      if (index === undefined) return null;
      out.write(index, bits);
    }
  }

  const body = out.bytes();
  return Uint8Array.from([...body, crc8(body)]);
}

export type DecodedSnapshot =
  | { ok: true; deck: Deck; state: GameState }
  /**
   * `corrupt` is dropped silently — the next snapshot replaces it anyway.
   * `incompatible` means the host runs another version or another deck: "update the app".
   */
  | { ok: false; reason: "corrupt" | "incompatible" };

const CORRUPT = { ok: false, reason: "corrupt" } as const;
const INCOMPATIBLE = { ok: false, reason: "incompatible" } as const;

/**
 * Decode a packet into a `GameState`-shaped value the existing selectors can render.
 *
 * The result has no draw pile and no history — a viewer neither needs nor may have the
 * cards still to come — and `currentCard` is set only in `revealed`.
 *
 * AGENTS.md asks of any phase set from outside the reducer whether it is *earned*. This
 * one is: the host's reducer reached it, and a viewer can only see `revealed` because
 * the host revealed and then broadcast. An in-play packet carries no card, so there is
 * nothing here for a viewer to reveal early.
 */
export function decodeSnapshot(
  bytes: Uint8Array,
  decks: readonly Deck[],
): DecodedSnapshot {
  if (bytes.length < 2) return CORRUPT;
  const body = bytes.subarray(0, bytes.length - 1);
  // ggwave's Reed-Solomon can mis-correct a damaged packet into a different, plausible
  // one. The CRC is what catches that.
  if (crc8(body) !== bytes[bytes.length - 1]) return CORRUPT;

  const input = new BitReader(body);
  const version = input.read(VERSION_BITS);
  if (version === null) return CORRUPT;
  if (version !== SNAPSHOT_VERSION) return INCOMPATIBLE;

  const phaseIndex = input.read(PHASE_BITS);
  const teams = input.read(TEAM_BITS);
  const currentTeam = input.read(TEAM_BITS);
  const deckIndex = input.read(DECK_INDEX_BITS);
  const hash = input.read(DECK_HASH_BITS);
  const round = input.read(ROUND_BITS);
  if (
    phaseIndex === null ||
    teams === null ||
    currentTeam === null ||
    deckIndex === null ||
    hash === null ||
    round === null
  ) {
    return CORRUPT;
  }

  const deck = decks[deckIndex];
  if (deck === undefined || deckHash(deck) !== hash) return INCOMPATIBLE;

  const phase = WIRE_PHASES[phaseIndex];
  if (phase === undefined || teams < 1 || currentTeam >= teams) return CORRUPT;

  const bits = indexBits(deck);
  const cardAt = (index: number | null): TrackId | null =>
    index === null ? null : (deck.cards[index]?.spotifyTrackId ?? null);

  let currentCard: TrackId | null = null;
  let lastPlacement: GameState["lastPlacement"] = null;
  if (phase === "revealed") {
    currentCard = cardAt(input.read(bits));
    const team = input.read(TEAM_BITS);
    const slot = input.read(SLOT_BITS);
    const correct = input.read(1);
    if (currentCard === null || team === null || slot === null || correct === null) {
      return CORRUPT;
    }
    if (team >= teams) return CORRUPT;
    lastPlacement = { team, slot, correct: correct === 1 };
  }

  const timelines: Timeline[] = [];
  for (let team = 0; team < teams; team++) {
    const length = input.read(LENGTH_BITS);
    if (length === null) return CORRUPT;
    const timeline: Timeline = [];
    for (let i = 0; i < length; i++) {
      const id = cardAt(input.read(bits));
      if (id === null) return CORRUPT;
      timeline.push(id);
    }
    timelines.push(timeline);
  }

  // Trailing bytes mean the packet was not what it claims to be.
  if (input.bytesConsumed !== body.length) return CORRUPT;

  return {
    ok: true,
    deck,
    state: {
      phase,
      deckId: deck.id,
      drawPile: [],
      currentCard,
      round,
      timelines,
      currentTeam,
      lastPlacement,
      history: [],
    },
  };
}
