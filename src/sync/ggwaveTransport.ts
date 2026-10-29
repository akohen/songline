import type { Ggwave, GgwaveInstance } from "ggwave";

/**
 * Bytes over ultrasound, with ggwave. Host side: `createTransmitter`. Viewer side:
 * `openMicrophone` from a tap, then `listen`.
 *
 * Every workaround here was found the hard way with the standalone probe
 * (public/sound-probe.html), on real phones. docs/tech/sound-sync.md has the detail.
 */

/** ggwave 0.4.0 decodes nothing at 44.1 kHz and its encoder aborts there. */
export const GG_RATE = 48_000;

/** ggwave silently drops any input left over after whole frames of this size. */
export const FRAME = 1024;

/**
 * Of ggwave's 1–100. Device testing was at 50; 30 makes the burst less noticeable in
 * the room, at some cost in range (about 4.4 dB) — not yet checked on real phones.
 */
const VOLUME = 30;

export type GgwaveCodec = {
  /** Mono float samples at `GG_RATE`. */
  encode(bytes: Uint8Array): Float32Array;
  /** Exactly one `FRAME` of samples at `GG_RATE`; a packet once one completes. */
  decode(frame: Float32Array): Uint8Array | null;
};

let loading: Promise<GgwaveCodec> | null = null;

/**
 * Load ggwave on first use. `import()` keeps its ~150 KB out of the main bundle: it is
 * fetched only when a host turns joining on, or on the watch screen.
 */
export function loadGgwave(): Promise<GgwaveCodec> {
  loading ??= import("ggwave")
    .then(async ({ default: factory }) => {
      // The npm binding printf()s on every encode; these swallow it. `disableLog` covers
      // the decoder's own chatter.
      const gg = await factory({ print: () => {}, printErr: () => {} });
      gg.disableLog();
      return wrap(gg);
    })
    .catch((err: unknown) => {
      // Let a later call try again — a chunk that failed to fetch may fetch next time.
      loading = null;
      throw err;
    });
  return loading;
}

function wrap(gg: Ggwave): GgwaveCodec {
  const parameters = gg.getDefaultParameters();
  parameters.sampleRateInp = GG_RATE;
  parameters.sampleRateOut = GG_RATE;
  const instance: GgwaveInstance = gg.init(parameters);
  const protocol = gg.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_FASTEST;

  return {
    encode(bytes) {
      // A view into a static WASM buffer that the next call overwrites: copy first.
      const view = gg.encode(instance, bytes, protocol, VOLUME);
      return new Float32Array(new Int8Array(view).buffer);
    },
    decode(frame) {
      const view = gg.decode(instance, new Int8Array(frame.slice().buffer));
      return view.length > 0 ? new Uint8Array(new Int8Array(view).buffer) : null;
    },
  };
}

/**
 * Streaming Catmull-Rom resampler: chunks at `from` Hz in, chunks at `to` Hz out, of
 * whatever size arrives. Only needed where the browser will not hand the mic over at
 * 48 kHz itself (Firefox).
 */
export function createResampler(from: number, to: number) {
  const step = from / to;
  // The last three input samples, carried across chunks so the curve is continuous.
  let history = new Float32Array(3);
  let position = 1;

  return (input: Float32Array): Float32Array => {
    const x = new Float32Array(history.length + input.length);
    x.set(history);
    x.set(input, history.length);
    const out: number[] = [];
    while (position + 2 < x.length) {
      const i = Math.floor(position);
      const t = position - i;
      const p1 = x[i] ?? 0;
      const p0 = x[i - 1] ?? p1;
      const p2 = x[i + 1] ?? 0;
      const p3 = x[i + 2] ?? 0;
      out.push(
        p1 +
          0.5 *
            t *
            (p2 -
              p0 +
              t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0))),
      );
      position += step;
    }
    position -= x.length - history.length;
    history = x.slice(x.length - history.length);
    return Float32Array.from(out);
  };
}

/**
 * Re-chunks any stream of samples into exact `FRAME`s. Without it nothing decodes —
 * ggwave drops partial frames without a word, and audio callbacks rarely line up.
 */
export function createFrameAccumulator(onFrame: (frame: Float32Array) => void) {
  const frame = new Float32Array(FRAME);
  let filled = 0;

  return (chunk: Float32Array): void => {
    for (let i = 0; i < chunk.length; ) {
      const n = Math.min(FRAME - filled, chunk.length - i);
      frame.set(chunk.subarray(i, i + n), filled);
      filled += n;
      i += n;
      if (filled === FRAME) {
        filled = 0;
        onFrame(frame.slice());
      }
    }
  };
}

/** Older iOS Safari only has the prefixed constructor. */
function newAudioContext(sampleRate?: number): AudioContext {
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (sampleRate !== undefined) {
    try {
      return new Context({ sampleRate });
    } catch {
      // Refused the rate. Run at the native one; 48 kHz buffers are resampled on output.
    }
  }
  return new Context();
}

// ---------- host ----------

/**
 * The host's broadcast context. **Call from inside a click handler** — Start or Resume.
 * iOS starts audio only from a gesture, the same rule as `activateElement` in
 * AGENTS.md; created from an effect it stays suspended and nothing is ever heard.
 */
export function createBroadcastContext(): AudioContext {
  const context = newAudioContext(GG_RATE);
  void context.resume().catch(() => {});
  return context;
}

export type Transmitter = {
  /** Sends `bytes`, cutting off anything still on air: a newer snapshot supersedes it. */
  transmit(bytes: Uint8Array): void;
  stop(): void;
};

export function createTransmitter(context: AudioContext): Transmitter {
  let current: AudioBufferSourceNode | null = null;
  // Encoding waits for ggwave to load; a snapshot that was overtaken meanwhile is
  // dropped rather than played after the newer one.
  let generation = 0;

  const cut = () => {
    if (current === null) return;
    current.onended = null;
    try {
      current.stop();
    } catch {
      // Already finished.
    }
    current.disconnect();
    current = null;
  };

  return {
    transmit(bytes) {
      const mine = ++generation;
      loadGgwave()
        .then((codec) => {
          if (mine !== generation) return;
          const samples = codec.encode(bytes);
          cut();
          // An interruption (a call, Siri) can suspend the context. Worth one try; a
          // failure costs only this packet, and the next snapshot repeats everything.
          if (context.state !== "running") void context.resume().catch(() => {});
          const buffer = context.createBuffer(1, samples.length, GG_RATE);
          buffer.getChannelData(0).set(samples);
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          source.onended = () => {
            if (current === source) current = null;
          };
          source.start();
          current = source;
        })
        .catch((err: unknown) => {
          // A broadcast is a courtesy to viewers. It must never interrupt the game.
          console.warn("Could not broadcast the game state.", err);
        });
    },
    stop() {
      generation++;
      cut();
    },
  };
}

// ---------- viewer ----------

export type Microphone = { context: AudioContext; stream: Promise<MediaStream> };

export type ListenFailure = "denied" | "unavailable";

/** False on plain HTTP (other than 127.0.0.1), where browsers withhold the mic. */
export function canUseMicrophone(): boolean {
  return window.isSecureContext && navigator.mediaDevices?.getUserMedia !== undefined;
}

/**
 * Start the microphone. **Call from inside a tap**, so the context may start on iOS.
 * The caller owns the result and releases it with `closeMicrophone` — again from an
 * event, never an effect cleanup, which StrictMode runs on every mount.
 */
export function openMicrophone(): Microphone {
  const context = newAudioContext(GG_RATE);
  void context.resume().catch(() => {});
  const stream = navigator.mediaDevices.getUserMedia({
    // Every one of these on treats the tones as noise and removes them.
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
  // `listen` reports a refusal. This only keeps an unawaited rejection out of the log.
  stream.catch(() => {});
  return { context, stream };
}

export function closeMicrophone(mic: Microphone): void {
  mic.stream.then(
    (stream) => {
      for (const track of stream.getTracks()) track.stop();
    },
    () => {},
  );
  void mic.context.close().catch(() => {});
}

/**
 * Decode packets from the microphone until the returned function is called. Safe to
 * start and stop repeatedly on one `Microphone` — it only wires nodes; the mic and its
 * context belong to the caller.
 */
export function listen(
  mic: Microphone,
  onPacket: (bytes: Uint8Array) => void,
  onError: (failure: ListenFailure) => void,
): () => void {
  let stopped = false;
  let release = () => {};

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await mic.stream;
    } catch (err) {
      if (!stopped) {
        onError(
          err instanceof Error && err.name === "NotAllowedError"
            ? "denied"
            : "unavailable",
        );
      }
      return;
    }

    const codec = await loadGgwave();
    if (stopped) return;

    let context = mic.context;
    let ownContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode;
    try {
      source = context.createMediaStreamSource(stream);
    } catch {
      // Firefox will not connect a mic to a context at another rate than its own. Run
      // at the native rate and resample to 48 kHz here instead. This context starts
      // outside the tap; Firefox allows that while the mic is live (unverified on iOS,
      // which never takes this path).
      ownContext = newAudioContext();
      context = ownContext;
      source = context.createMediaStreamSource(stream);
    }
    if (context.state !== "running") await context.resume();
    if (stopped) {
      void ownContext?.close().catch(() => {});
      return;
    }

    const resample =
      context.sampleRate === GG_RATE
        ? null
        : createResampler(context.sampleRate, GG_RATE);
    const feed = createFrameAccumulator((frame) => {
      const bytes = codec.decode(frame);
      if (bytes !== null) onPacket(bytes);
    });

    // ScriptProcessor is deprecated but universally supported, and ggwave decodes on the
    // main thread anyway. It only runs while connected to the output, so it goes there
    // through a muted gain.
    const processor = context.createScriptProcessor(FRAME, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    processor.onaudioprocess = (event) => {
      const raw = event.inputBuffer.getChannelData(0);
      feed(resample ? resample(raw) : raw);
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);

    release = () => {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      mute.disconnect();
      void ownContext?.close().catch(() => {});
    };
  };

  start().catch(() => {
    if (!stopped) onError("unavailable");
  });

  return () => {
    stopped = true;
    release();
  };
}
