# Game Design

## Concept

A song plays. Players do not know what it is. They must decide **when it was
released**, relative to the songs already placed. Correct placements build a
shared or personal timeline; the game ends when someone reaches a target.

## Terminology

| Term | Meaning |
|---|---|
| **Deck** | A curated, ordered-agnostic pool of songs with verified release years |
| **Card** | One song drawn from a deck. Has a hidden face (year, title, artist) and a blank face |
| **Timeline** | A chronologically ordered sequence of revealed cards |
| **Draw** | Taking the next card from the deck and starting playback |
| **Placement** | A player's claim that the current card belongs at a given slot in a timeline |
| **Reveal** | Showing the card's year, title and artist, resolving the placement |
| **Round** | One draw → placement → reveal cycle |

## The core loop

This loop is invariant across all rulesets. Only *who places*, *how placement is
recorded*, and *how it is scored* change.

```
   ┌──────────┐   draw    ┌──────────┐   reveal    ┌──────────┐
   │   IDLE   ├──────────▶│  IN PLAY ├────────────▶│ REVEALED │
   └──────────┘           └──────────┘             └────┬─────┘
                                ▲                       │
                                └────── draw ───────────┘
```

- **IDLE** — deck loaded, waiting for the host to start.
- **IN PLAY** — a card is in play and no metadata is visible anywhere. Players
  deliberate.
- **REVEALED** — year, title and artist are shown.

Two actions drive it: **draw** and **reveal**. The draw button is labelled "Start"
in IDLE and "Next song" afterwards, but it is the same action — which is why a
track that refuses to play needs no special handling: press Next.

**"IN PLAY" is not "audio is playing".** Audio can be paused, replayed or finished
while the card is still in play. Playback is controlled independently of the phase
and continues through REVEALED until the host draws again.

**Reveal is optional.** Drawing from IN PLAY without revealing is legal — that is
how a card nobody can place gets abandoned.

### What later iterations insert

A **PLACED** phase sits between IN PLAY and REVEALED once the app records placements,
and a distinct **skip** action separates "discarded, nobody scores" from "resolved".
Neither earns its place while the timeline is on paper and nothing is scored.

## Iteration 1 — timeline lives outside the app

Players maintain the timeline physically, with paper cards. The app is only a
**blind jukebox with a reveal button**:

1. Host selects a deck.
2. Host taps **Start**. Playback begins. The screen shows nothing identifying —
   only a round number and playback controls.
3. Players argue, then physically place a blank card in their timeline.
4. Host taps **Reveal**. **Title and artist** appear first, alone; the **year**
   follows about a second later, large. Leading with the song lets the room register
   what it is before the number lands — one tap, staged presentation, not two taps.
5. Players write the year on their card. Host taps **Next song**, and the song keeps
   playing until they do.

The app owns: deck management, playback, no-spoiler guarantees, draw-without-repeat,
and reveal. It does not own scoring or timeline state.

This is deliberately the smallest thing that makes the game playable, and it
sidesteps every hard problem (multi-device sync, placement UI, rules variants)
until the playback foundation is proven.

## Rules that vary between rulesets

The engine must not hard-code these. They are the axes along which later
iterations will differ:

| Axis | Options |
|---|---|
| Timeline ownership | One shared timeline / one timeline per player |
| Placement validity | Strictly between the two neighbouring years / tolerance of ±N years |
| Ties | Same year as a neighbour counts as correct / must specify before or after |
| Turn order | Round-robin / whoever buzzes first / everyone places simultaneously |
| Failure | Card discarded / card offered to the next player ("steal") |
| Tokens | None / earned for correct placements, spent to skip or challenge |
| Victory | First to N cards / most cards after N rounds / deck exhausted |
| Bonus guesses | None / guess title or artist for an extra token |

**Design constraint:** the game engine is a pure function of
`(state, ruleset, event) → state`. Rulesets are data, not code branches scattered
through the UI. Iteration 1 scores nothing at all, so it ships no ruleset type —
see [03-architecture.md](03-architecture.md#no-ruleset-parameter-yet).

## Difficulty levers

Available to tune a deck or a session without changing the rules:

- **Year spread** — a deck spanning 1955–2025 is easier than one spanning 1990–2005.
- **Song familiarity** — obscure tracks are dramatically harder.
- **Start offset** — starting at 0:00 gives away era via intro production; starting
  mid-song can be harder or easier depending on the track. Per-card, curated.
- **Clip length** — an enforced 15/30-second window is harder than unlimited replay.
- **Seed round** — the first card is placed for free to anchor the timeline.

## Explicit non-goals

- No leaderboards, accounts, or persistence across sessions beyond the current game.
- No audio manipulation (fading, mixing, overlaying). Prohibited by Spotify policy
  and unnecessary.
- No lyrics, album art, or synchronized visuals. Album art would spoil the answer
  and synchronization with visual media is prohibited by Spotify policy.
