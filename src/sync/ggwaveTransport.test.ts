import { describe, expect, it } from "vitest";
import { getDeck } from "@/decks/loadDeck";
import { createGame } from "@/engine/createGame";
import { reduce } from "@/engine/reduce";
import { seededRng } from "@/engine/testUtils";
import { encodeSnapshot } from "@/sync/codec";
import {
  createFrameAccumulator,
  createResampler,
  FRAME,
  GG_RATE,
  loadGgwave,
} from "@/sync/ggwaveTransport";

// biome-ignore lint/style/noNonNullAssertion: the 308-card deck is bundled
const rock = getDeck("hitster-rock")!;

/**
 * Band-limited (Hann-windowed sinc) resampling, offline — how a real 44.1 kHz mic
 * would capture a 48 kHz signal.
 *
 * Deliberately not `createResampler`. Making the test signal with the resampler under
 * test lets its errors cancel out on the way back: that is how a 32 kHz round trip once
 * appeared to work, when 15–19.5 kHz cannot exist below a 16 kHz Nyquist limit at all.
 */
function bandLimitedResample(x: Float32Array, from: number, to: number): Float32Array {
  const y = new Float32Array(Math.floor((x.length * to) / from));
  const cutoff = (0.95 * Math.min(from, to)) / 2 / from;
  const half = 32;
  for (let j = 0; j < y.length; j++) {
    const t = (j * from) / to;
    const centre = Math.floor(t);
    let sum = 0;
    for (let i = centre - half; i <= centre + half; i++) {
      const sample = x[i];
      if (sample === undefined) continue;
      const d = t - i;
      const sinc =
        d === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * d) / (Math.PI * d);
      sum += sample * sinc * (0.5 + 0.5 * Math.cos((Math.PI * d) / (half + 1)));
    }
    y[j] = sum;
  }
  return y;
}

/** A packet from a real game: two teams, a few rounds in, revealed. */
function snapshot(): Uint8Array {
  const rng = seededRng(4);
  let state = createGame(rock, { teamCount: 2, rng });
  for (let i = 0; i < 6; i++) {
    state = reduce(state, { type: "DRAW" }, rock);
    state = reduce(state, { type: "REVEAL", slot: 0 }, rock);
  }
  const bytes = encodeSnapshot(state, [rock]);
  if (bytes === null) throw new Error("fixture did not encode");
  return bytes;
}

/** Feeds `signal` through the viewer's pipeline in uneven chunks, as a mic would. */
function receive(signal: Float32Array, rate: number, decode: (f: Float32Array) => void) {
  const resample = rate === GG_RATE ? null : createResampler(rate, GG_RATE);
  const feed = createFrameAccumulator(decode);
  const sizes = [128, 4096, 777, 2048, 333, 1024, 1];
  for (let i = 0, k = 0; i < signal.length; k++) {
    const n = sizes[k % sizes.length] ?? 1;
    const chunk = signal.subarray(i, i + n);
    feed(resample ? resample(chunk) : chunk);
    i += n;
  }
}

describe("ggwave transport, end to end", () => {
  it("decodes a 48 kHz snapshot captured at 44.1 kHz", async () => {
    const codec = await loadGgwave();
    const bytes = snapshot();
    const waveform = codec.encode(bytes);

    // Silence either side, so the packet starts and ends mid-frame like a real one.
    const padded = new Float32Array(waveform.length + 2 * GG_RATE);
    padded.set(waveform, 12_345);
    const mic = bandLimitedResample(padded, GG_RATE, 44_100);

    const received: Uint8Array[] = [];
    receive(mic, 44_100, (frame) => {
      expect(frame).toHaveLength(FRAME);
      const packet = codec.decode(frame);
      if (packet !== null) received.push(packet);
    });

    expect(received).toEqual([bytes]);
  });

  it("decodes at 48 kHz with no resampler", async () => {
    const codec = await loadGgwave();
    const bytes = snapshot();
    const padded = new Float32Array(codec.encode(bytes).length + GG_RATE);
    padded.set(codec.encode(bytes), 777);

    const received: Uint8Array[] = [];
    receive(padded, GG_RATE, (frame) => {
      const packet = codec.decode(frame);
      if (packet !== null) received.push(packet);
    });

    expect(received).toEqual([bytes]);
  });

  it("returns copies, not views into ggwave's static buffer", async () => {
    const codec = await loadGgwave();
    const first = codec.encode(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    const before = first.slice();
    codec.encode(Uint8Array.from([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]));
    expect(first).toEqual(before);
  });
});
