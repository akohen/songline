# Sound sync — viewers over ultrasound

Phones near the host follow a **timeline-mode** game — every team's score, the current
team's timeline, the reveal — with no Spotify account, no network and no backend. The
host broadcasts the game as short ultrasonic packets with
[ggwave](https://github.com/ggerganov/ggwave); viewers decode them from the microphone.

Data flows **one way**. The host never listens and viewers never send. The product side
— who sees what, the toggle, the join flow — is in
[../product/watching.md](../product/watching.md).

Code: `src/sync/codec.ts` (pure, the byte layout), `src/sync/ggwaveTransport.ts`
(audio), `src/ui/useBroadcast.ts` (host), `src/ui/WatchScreen.tsx` (viewer).

---

## Snapshots, not events

Every packet is a complete, self-contained picture of what a viewer displays. Nothing
refers to an earlier packet.

- **Loss costs nothing lasting.** Over air in a noisy room some packets will not
  arrive. With snapshots the next one repairs it; with an event log one missed `DRAW`
  would corrupt every screen until the game ended.
- **Late joiners need no catch-up.** A phone that joins mid-game is correct after the
  first packet it hears.
- **The engine stays untouched.** Replaying events on the viewer would need the draw
  pile in the same order, which means a seed and a PRNG in `createGame` — and a pile on
  every viewer that is, by construction, a list of future answers.

The cost is size: a snapshot carries every placed card every time. Bit-packing keeps
the worst real game near 53 bytes (below).

## Why ultrasonic

`GGWAVE_PROTOCOL_ULTRASOUND_FASTEST` (15–19.5 kHz), variable-length mode, only. Tested
on real phones with music playing, and it gets through. Audible modes were tested in
the probe too and dropped: the room would hear a chirp on every turn, over the song.
No volume ducking, no jingles.

Transmit volume is **50** (of ggwave's 1–100), the level used in device testing.

## Byte layout

One bit stream, most significant bit first, zero-padded to a whole byte, then a CRC-8.

| Field | Bits | Notes |
|---|---|---|
| version | 4 | Currently 1. A mismatch is rejected as incompatible. |
| phase | 2 | `idle` 0, `inPlay` 1, `revealed` 2, `finished` 3 |
| team count | 3 | 1–7; a game with no teams is never broadcast |
| current team | 3 | |
| deck index | 8 | Position in `DECKS` |
| deck hash | 8 | CRC-8 over the deck id and its card ids in order |
| round | 16 | |
| *revealed only:* card index | b | The card just revealed |
| *revealed only:* placement team | 3 | `lastPlacement.team` |
| *revealed only:* slot | 5 | `lastPlacement.slot` |
| *revealed only:* correct | 1 | `lastPlacement.correct` |
| *per team:* timeline length | 5 | |
| *per team:* cards | length × b | Indices into `deck.cards`, **in recorded order** |
| CRC-8 | 8 | Over every byte before it; polynomial 0x07 |

`b = ceil(log2(deck.cards.length))` — 9 for the 308-card Hitster Rock deck, so one
byte per card would not do.

**Worst real game:** four teams at 10 + 9 + 9 + 9 cards (the game ends the moment one
team reaches 10) plus a reveal, on the 308-card deck: 415 bits → 53 bytes with the CRC,
about 2.3 s on air. ggwave's variable-length limit is 140 bytes. A timeline longer than
31 cards cannot be encoded and the encoder returns null rather than truncate it.

**Timelines keep their recorded order.** Never sort them: two cards of the same year sit
in whatever order the players chose (see `Timeline` in `src/engine/types.ts`).

**The deck hash** makes a viewer running an older build — one whose deck has different
cards, or the same cards in a different order — show "update the app" instead of the
wrong songs. The index alone would silently resolve to whatever card sits there now.

**The CRC** is there because ggwave's Reed-Solomon can mis-correct: a damaged packet
can come out of the decoder as a different, valid-looking one. A bad CRC is dropped
silently; the next snapshot replaces it anyway.

### The spoiler gate

`encodeSnapshot` reads `currentCard` **only when `phase === "revealed"`**. An in-play
snapshot has no field for it at all — two in-play states that differ only in the card
encode to identical bytes, and the codec test asserts exactly that.

That keeps invariant 1 true by construction, not by trusting viewers. It is not about
cheating: a packet that carried the answer would put it one decoder away from a screen.

The viewer decodes into a `GameState`-shaped value and renders it through the same
selectors as the host — `selectTeams`, `selectPlacement`, `selectRevealedCard` — so
track IDs are still resolved only inside the engine. AGENTS.md asks of every phase set
from outside the reducer whether it is *earned*: here the host's reducer earned it, and
the only way a viewer state reaches `revealed` is a packet the host sent after its own
reveal.

### When the host transmits

After every state change, which on the round screen means `DRAW` or `REVEAL` — and only
while "Let others join" is on and the game has teams. Nothing is sent otherwise: no
heartbeat, no repeat. If a new snapshot is ready while the previous one is still on air,
the old one is cut off and the new one sent; it supersedes it anyway.

## ggwave 0.4.0 — quirks that cost time

Found with the standalone probe ([`public/sound-probe.html`](../../public/sound-probe.html),
kept as a field diagnostic: it shows whether the 15–19.5 kHz band reaches a given phone
at all).

- **48 kHz only.** At 44.1 kHz decoding finds nothing and encoding aborts. Everything
  runs at 48 kHz:
  - the host `AudioContext` is created with `{ sampleRate: 48000 }`;
  - the viewer asks for a 48 kHz context too, so the browser resamples the mic. Where
    connecting the mic to it throws (Firefox), it falls back to the native rate and
    resamples in JS with a streaming Catmull-Rom resampler.
- **Whole 1024-sample frames.** `decode` silently discards whatever is left over after
  whole frames. Input is buffered and handed over exactly 1024 samples at a time
  (`Float32` viewed as `Int8Array`). Before this, nothing ever decoded.
- **Static WASM buffers.** `encode()` and `decode()` return views into a static buffer
  that the next call overwrites. Copy before doing anything else.
- **Mic processing off.** `echoCancellation`, `noiseSuppression` and `autoGainControl`
  all `false`, or the browser treats the tones as noise and removes them.
- **Secure context.** Mic access needs HTTPS or 127.0.0.1; viewers use the Firebase URL.
- **A stray `printf` on every encode** in the npm binding. Passing no-op `print` and
  `printErr` to the module factory silences it; `disableLog()` handles the rest.
- **Bundling.** The package is a ~150 KB UMD file with the WASM inlined. It is reached
  only through `import()` — when the host turns joining on, or on the watch screen —
  so it lands in its own chunk. Vite warns that `fs` and `path` are externalised; they
  sit in the Node-only branch and are never reached in a browser.

### A 32 kHz microphone cannot work

15–19.5 kHz is above a 32 kHz device's 16 kHz Nyquist limit, and a real microphone's
anti-alias filter removes it before JS sees a sample. A synthetic round trip *appears*
to work at 32 kHz when the same naive resampler is used to make the test signal and to
undo it — the aliasing cancels itself. With an independent band-limited downsample it
fails, as it should. For the same reason the transport test builds its 44.1 kHz signal
with a windowed-sinc filter, not with the resampler under test.

## Measured airtime (ultrasound fastest)

| Payload | Airtime |
|---|---|
| 10 B | 1.07 s |
| 20 B | 1.39 s |
| 30 B | 1.64 s |
| 50 B | 2.28 s |
| 55 B | 2.41 s |
| 140 B | 4.97 s |

Device-measured up to 50 B; 55 B and 140 B are the encoder's own sample count at 48 kHz,
which matches the device figures where they overlap.

## Gestures

The same rule as `activateElement` in AGENTS.md, for iOS's audio:

- **Host:** the `AudioContext` is created, or resumed, inside the Start/Resume click
  handler — never from an effect. It lives as long as the game session, so "Play this
  deck again" keeps broadcasting.
- **Viewer:** the context is created inside the Join tap, then the microphone is
  requested. Retry after a denial is its own tap.

## Not built

Proposals, not plans:

- A "resend" button on the host for late joiners.
- Letting viewers browse other teams' timelines.
- Viewers sending anything back — that is the backend version of iteration 4.
- Broadcasting songs-only games.
