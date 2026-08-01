# Architecture

## Stack

| Choice | Rationale |
|---|---|
| React + TypeScript + Vite | Fast iteration, static output, no server needed |
| No backend | PKCE removes the need for a secret-holding server. Single-screen play removes the need for realtime sync. |
| Served at `127.0.0.1` on the host machine | Forced by two constraints, see below |
| Decks as bundled JSON | No CMS, no database, versioned with the code |

State stays in React plus `localStorage`; no state library until something demands
one. Adding a backend is a deliberate future decision (see
[05-roadmap.md](05-roadmap.md)), not an assumption baked in now.

### Where the app is served from

Two constraints combine to rule out LAN hosting:

- The Web Playback SDK needs EME, which needs a **secure context** — so
  `http://192.168.x.x:5173` will not work. Only HTTPS or a loopback address.
- Spotify **redirect URIs must be registered exactly** and cannot be wildcards, so a
  machine's changing LAN IP cannot be registered ahead of time.

The host therefore runs the app on their own machine at `http://127.0.0.1:5173`,
which is a valid secure context and a registrable redirect URI. This costs nothing:
single-screen play means only the host's machine ever renders the game. Deploying to
a real HTTPS host stays possible later, and is what iteration 4 would need.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  UI (React components)                                  │
│  Renders state. Holds no rules. Cannot reach Spotify.   │
└────────────────────────┬────────────────────────────────┘
                         │ dispatch(event) / read(state)
┌────────────────────────▼────────────────────────────────┐
│  Game engine  —  pure, no I/O, no React                 │
│  (state, ruleset, event) → state                        │
│  Owns the round state machine and spoiler gating        │
└────────────────────────┬────────────────────────────────┘
                         │ commands
┌───────────┬────────────▼──────────────┬─────────────────┐
│ Deck repo │  Playback port            │  Auth           │
│ load,     │  play / pause / seek      │  PKCE flow,     │
│ shuffle,  │  ┌──────────┬───────────┐ │  silent refresh,│
│ draw      │  │ SDK      │ WebAPI    │ │  token store    │
│           │  │ adapter  │ adapter   │ │                 │
└───────────┴──┴──────────┴───────────┴─┴─────────────────┘
```

**Dependency rule:** the engine imports nothing. The UI imports the engine. Adapters
implement ports the engine defines. This is what makes both the ruleset variants and
the eventual multi-device mode possible without a rewrite.

### Game engine

Pure and framework-free, so rules are testable without a browser or a Spotify token.

```ts
// 'inPlay' means "a card is in play", NOT "audio is currently running".
// Audio state belongs to the playback adapter, never to the engine.
type Phase = 'idle' | 'inPlay' | 'revealed' | 'finished'

type GameState = {
  phase: Phase
  deckId: string
  drawPile: TrackId[]       // shuffled, never mutated in place
  currentCard: TrackId | null
  round: number
  // Timeline ruleset only; empty is the paper ruleset. See 09-timeline-ruleset.md.
  timelines: TrackId[][]
  currentTeam: number
  lastPlacement: { team: number; slot: number; correct: boolean } | null
}

type GameEvent =
  | { type: 'DRAW' }        // "Start" in idle, "Next song" thereafter
  | { type: 'REVEAL'; slot?: number }   // slot present ⇒ a placement

reduce(state: GameState, event: GameEvent, deck: Deck): GameState
```

Transitions: `DRAW` moves any phase to `inPlay`, or to `finished` when the pile is
empty or a team has won. `REVEAL` moves `inPlay → revealed`, scoring the placement on
the way if there is one. That is the whole machine.

**`deck` is the third argument, not a `Ruleset`.** Judging a placement needs the card's
release year. Passing the year in on the event would mean the UI reading it while the
card is still in play — the exact leak the spoiler gate exists to stop — so the reducer
takes the card data instead, as the selectors already do. It is data, not I/O; the
engine still imports nothing but types.

There is no `revealed` boolean: it is `phase === 'revealed'`. Two fields encoding
one fact is a bug waiting to happen, and this particular fact is the one the whole
spoiler guarantee rests on.

No `SKIP`: with nothing scored, abandoning a card and finishing one are the same
act, and `DRAW` already does it. This is also the recovery path for a track that
fails to play.

### Still no `Ruleset` parameter

The predicted signature was `reduce(state, event, ruleset)`, where a `Ruleset` is data
plus pure predicates — `isPlacementCorrect`, `nextPlayer`, `isGameOver`, `scoreRound`.
Iteration 1 had none of those, so it would have been an empty object: an abstraction
constraining nothing while every call site paid for it.

**Two rulesets now exist and it still has not earned its place.** The difference
between them is entirely `timelines.length === 0`, which the state already says, and
the "predicates" turned out to be three small functions in `placement.ts` that both
rulesets share or ignore. A `Ruleset` object would be a container for one boolean.

What the third argument became instead is `deck` — needed for a concrete reason
(judging a placement needs a year) rather than a predicted one. The layering is what
protected us here, not the parameter: the engine stayed pure and UI-free, so widening
the signature when a real need arrived was mechanical.

### Spoiler gating is the engine's job

The single most important invariant: **card metadata is unreachable from the UI
until `revealed === true`.** This is enforced by the engine's selector API, not by
remembering not to render something.

```ts
// Returns null unless phase === 'revealed'. The UI cannot bypass this.
selectRevealedCard(state, decks): RevealedCard | null

// What the UI may render before reveal: nothing identifying.
selectRoundDisplay(state): { round: number; cardsRemaining: number }
```

The card's `spotifyTrackId` is passed to the playback adapter without ever entering
component props.

**Audio state is not engine state.** `isPlaying` and `positionMs` come from the
playback adapter's subscription, and the UI composes the two sources. Mirroring
them into `GameState` would make the engine impure, give playback two sources of
truth, and force every adapter event through the reducer for no gain.

### Playback port

```ts
interface PlaybackPort {
  initialize(): Promise<DeviceId>
  playTrack(trackId: string, startOffsetMs: number): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(positionMs: number): Promise<void>
  onStateChange(cb: (s: PlaybackState) => void): Unsubscribe
  suppressMetadata(): void   // Media Session override; re-applied on every track change
}
```

Two adapters: `WebPlaybackSdkAdapter` (primary) and `WebApiDeviceAdapter` (later
fallback). A third, `FakePlaybackAdapter`, plays silence on a timer — it lets the
whole game be developed and tested without Premium, a token, or network, and is
worth building on day one.

### Auth

PKCE flow, tokens in `localStorage`, refresh scheduled at ~80% of token lifetime.
On app load: restore session, refresh if stale, verify `product === 'premium'`,
show a specific error if not.

## Session persistence

The full `GameState` is serialised to `localStorage` after every event. A browser
refresh or an accidental tab close mid-party restores the draw pile and which cards
have been played.

**A restored game always resumes at `idle`**, with any in-flight card returned to the
front of the pile and the round counter rolled back, so resuming consumes nothing.

This is not a detail. Audio cannot survive a reload — the SDK holds nothing, and
playback cannot restart without a user gesture — so restoring mid-card produced a
card nobody could hear, and a game saved after a reveal **reopened with the year
already on screen**. Restoring a phase is only safe when the thing that phase
describes can also be restored, and playback cannot be.

Deliberately different from an explicit deck change, which clears the save outright:
leaving a deck abandons the game, whereas a reload means to continue it.

## Testing

| Layer | Approach |
|---|---|
| Engine | Unit tests. Pure functions, exhaustive on rules and edge cases. |
| Spoiler gating | Explicit tests asserting selectors return `null` before reveal — this is a correctness property, not a UI detail. |
| Decks | `npm run validate:decks` against the live API |
| Playback adapters | Manual. Thin wrappers over an SDK that cannot be meaningfully mocked. |
| UI | Driven by `FakePlaybackAdapter`, no Spotify required |

## Repository layout

```
src/
  engine/        # pure game logic, zero dependencies
    rules/       # ruleset definitions
  playback/      # PlaybackPort + adapters (sdk, webapi, fake)
  auth/          # PKCE, token storage and refresh
  decks/         # loader, shuffle, *.json deck files
  ui/            # React components and screens
scripts/
  validate-decks.ts
docs/
```
