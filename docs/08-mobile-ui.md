# Mobile Interface — Specification

Status: **implemented** (2026-08-01). Awaiting confirmation on a real phone — see
[Verification](#verification).

## Context

Iteration 1 shipped with no CSS at all — browser defaults plus three inline styles.
That was deliberate: the goal was a working game loop, and unstyled HTML is honest
about being unfinished. It works on a desktop and is unpleasant on a phone.

Now that the app is deployed to Firebase and playable from a phone
([07-deployment.md](07-deployment.md)), the phone is the primary device. This
document specifies the interface before any of it is written.

**Decisions taken with the user:** dark theme only; menu opens as a bottom sheet;
screen wake lock is in scope.

## Goals

1. Comfortable one-handed use on a phone, held or passed around a table.
2. Move sign-out and deck-change into a menu, out of the game screen.
3. Hide "Replay from start" unless the song has actually ended.
4. Stay simple. This is a small app and should keep a small stylesheet.

## Non-goals

Light theme, tablet- or desktop-specific layouts (they inherit the phone layout and
must simply not break), elaborate animation, installability/PWA, offline support.

---

## Design principles

**The pre-reveal screen is deliberately information-poor.** Nothing may identify the
song — that is the whole game, and the constraint is enforced in the engine, not
here (see [03-architecture.md](03-architecture.md)). So the play screen has almost
no content to arrange. Rather than fight that, the design leans on it: a lot of
space, a round number, and one obvious thing to press.

**The reveal is the emotional peak.** The year is the largest element in the entire
app by a wide margin. Everything else stays quiet so that moment lands.

> Qualified by the timeline ruleset. There the screen is not empty — the timeline *is*
> the game state and has to stay visible — so the year resolves on the placed card at
> about 2.5rem rather than taking the screen. It is still the largest thing on that
> screen; it is no longer the largest in the app. See
> [placement screen](#placement-screen--timeline-ruleset).

**One primary action at a time.** At any moment there is exactly one full-width
button at the bottom of the screen. Which action it is depends on the phase. Two
competing primary buttons is the main thing that would make this feel cluttered.

**Thumb zone.** Anything pressed every round lives in the bottom third. Anything
pressed once a session (menu, sign out) can live at the top.

**Glanceable.** The phone will sit on a table with people looking at it from odd
angles. Large type, high contrast, no thin greys for anything that matters.

---

## Visual system

A single stylesheet with CSS custom properties. **No CSS framework and no CSS
Modules**: seven small screens do not justify a new dependency or per-component
build ceremony, and the project has consistently added abstraction only when
something demands it.

### Colour — dark only

```css
--bg:             #0d0f12;  /* page */
--surface:        #16191e;  /* cards, sheet */
--surface-raised: #232830;  /* pressed states, secondary buttons */
--border:         rgba(255, 255, 255, 0.09);

--text:           #f2f4f7;
--text-muted:     #98a2b3;  /* ≥4.5:1 on --bg */

--accent:         #ffb703;  /* amber */
--accent-text:    #1a1206;  /* on amber */
--danger:         #f97066;
```

**The accent is deliberately not Spotify green.** Using `#1db954` would imply an
affiliation that does not exist, and Spotify's design guidelines restrict use of
their brand colour. Amber also suits a quiz game and is unmistakably ours.

All text/background pairs must clear WCAG AA (4.5:1 normal, 3:1 large). `--text-muted`
on `--bg` is the tightest pair and must be checked when implementing.

### Type

System font stack — no web font. A downloaded font would be one more thing to load
before a party starts, and adds nothing here.

```css
--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

| Role | Size | Notes |
|---|---|---|
| Revealed year | `clamp(4.5rem, 22vw, 9rem)`, weight 800 | `font-variant-numeric: tabular-nums` so digits do not jitter |
| Screen title | `1.5rem`, weight 700 | |
| Body | `1rem` (16px minimum) | Never smaller for interactive text |
| Meta / muted | `0.875rem` | Non-essential only |

### Spacing, shape, motion

4px base scale (`--space-1: 0.25rem` … `--space-8: 3rem`). Radius: `--radius: 12px`
for buttons and cards, `--radius-lg: 20px` for the sheet's top corners.

Transitions are 150–200ms on opacity and transform only. Everything animated must be
wrapped in `@media (prefers-reduced-motion: reduce)` and disabled there.

---

## App chrome

A persistent header appears on every screen **once signed in**. It is not shown on
the login, wrong-origin or not-premium screens, which have nothing to menu.

```
┌──────────────────────────────┐
│  Song Timeline           ⋯   │   48px, --surface, hairline bottom border
└──────────────────────────────┘
```

The header title is the static string "Song Timeline". It must never reflect deck or
track state — the same rule as the browser tab title in
[index.html](../index.html).

### Menu — bottom sheet

Triggered by the `⋯` button. Slides up from the bottom, over a scrim.

```
┌──────────────────────────────┐
│                              │
│         (scrim, 60%)         │
│                              │
├──────────────────────────────┤
│           ────               │  grab handle
│                              │
│  Signed in as Alexandre      │  muted, non-interactive
│  International Classics      │  current deck, when one is chosen
│                              │
│  New game                    │  ≥48px row
│  Sign out                    │
│                              │
│  Powered by Spotify          │  muted footnote
└──────────────────────────────┘
```

**Contents are contextual:**

| Item | Shown when |
|---|---|
| Signed-in name | always |
| Current deck name | a deck is selected |
| New game | a game is in progress. Returns to the game start screen; the game stays resumable |
| Sign out | always |

Dismissed by: tapping the scrim, pressing Escape, or selecting an item.

**Accessibility requirements** — a sheet is the easiest thing here to get wrong:

- Trigger has `aria-haspopup="dialog"` and `aria-expanded`.
- Sheet is `role="dialog"` `aria-modal="true"` with an accessible name.
- Focus moves into the sheet on open, is trapped while open, and returns to the
  trigger on close.
- Escape closes it.
- Background scroll is locked while open.

**"Powered by Spotify"** appears in the sheet footer. Spotify's design guidelines
expect attribution from apps using their content; the sheet is the least intrusive
place that is still always reachable.

---

## Screens

### Round screen

The screen that matters. Three regions: header, a main area that grows, and a footer
pinned to the bottom.

**Before reveal**

```
┌──────────────────────────────┐
│  Song Timeline           ⋯   │
├──────────────────────────────┤
│                              │
│          Round 3             │  1.5rem, weight 700
│       12 songs left          │  muted
│                              │
│         ╭───╮ ╭──╮           │
│         │ ❚❚│ │+15│         │  76px circle, ring pulses while playing;
│         ╰───╯ ╰──╯           │  forward button skips 15s, disabled at song end
│            Pause             │  text label beneath the circle only
│                              │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │    Reveal the year     │  │  PRIMARY, full width, 56px
│  └────────────────────────┘  │
│         Skip this song       │  tertiary text button
└──────────────────────────────┘
```

**After reveal**

```
├──────────────────────────────┤
│                              │
│                              │
│    Bohemian Rhapsody         │
│         Queen                │  muted
│                              │
│          1975                │  clamp(4.5rem, 22vw, 9rem), amber, fades in ~1s later
│                              │
│         ╭───╮ ╭──╮           │
│         │ ❚❚│ │+15│         │  same centred control, forward button alongside
│         ╰───╯ ╰──╯           │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │      Next song         │  │  PRIMARY
│  └────────────────────────┘  │
└──────────────────────────────┘
```

The staged reveal — title and artist first, the year about a second later — is
specified in [01-game-design.md](01-game-design.md) and is preserved. Under
`prefers-reduced-motion` both appear at once.

**Primary action by phase** — exactly one at a time:

| Phase | Primary button | Also present |
|---|---|---|
| `inPlay` | **Reveal the year** | Pause/Play, "Skip this song" (tertiary) |
| `revealed` | **Next song** | Pause/Play |
| `finished` | **Play this deck again** | "Choose another deck" (secondary) |

**There is no `idle` row.** The round screen is never entered idle: `Start`, `Resume`
and `Play this deck again` all draw the first card inside their own click, so a song is
already in play by the time this screen appears. It briefly had a Start button of its
own, which after the game start screen arrived meant pressing Start twice to begin one
game.

That the draw happens *in the click* is not a detail — it is what keeps
`activateElement()` inside a user gesture. See
[02-spotify-constraints.md](02-spotify-constraints.md).

"Skip this song" and "Next song" dispatch the same `DRAW` event — the engine has only
two events. The label differs because the intent differs: abandoning a card nobody
can place, versus moving on after a reveal.

### Placement screen — timeline ruleset

The optional in-app timeline ([09-timeline-ruleset.md](09-timeline-ruleset.md)) gives
the round screen a second, content-dense layout. The paper-ruleset screen above is
**unchanged**; which one renders is decided by `selectTeams` returning null.

```
┌──────────────────────────────┐
│  Song Timeline           ⋯   │
├──────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐         │  score strip — hidden with one team,
│ │T1 3│ │T2 5│ │T3 2│         │  current team outlined in amber
│ └────┘ └────┘ └────┘         │
│           Team 2             │  omitted with one team
│    Where does this song go?  │  muted
│         ╭──╮ ╭──╮            │  56px, no text label — the timeline
│         │❚❚│ │+15│           │  needs the vertical space
│         ╰──╯ ╰──╯            │
│  1965 ● Satisfaction         │  scrolls; header and footer do not
│       ┊ ┌──────────────────┐ │
│       ┊ │  1965 – 1991     │ │  slot: ≥48px, dashed, amber when picked
│       ┊ └──────────────────┘ │
│  1991 ● Teen Spirit          │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │     Place it here      │  │  PRIMARY, disabled until a slot is picked
│  └────────────────────────┘  │
│         Skip this song       │  free action — the turn does not move
└──────────────────────────────┘
```

**Vertical, not horizontal.** A horizontal strip either scrolls the page sideways —
forbidden here — or shrinks the slots below a thumb once a timeline passes about four
cards.

**Only the placing team's timeline is shown.** Three timelines on a phone would leave
none of them a usable slot. The score strip is what keeps the others present.

**The slots are the primary action.** While a card is in play there is no enabled
primary button until a slot is chosen — the "one primary action" rule holds, it is just
disabled until the choice exists. Selecting is reversible and lives in component state;
only the confirm reaches the engine.

**The reveal resolves in place**, on the card where it was placed: amber when correct,
`--danger` when not, with the year at ~2.5rem. A missed placement that could have gone
in two slots (a tie) marks **both** — the feedback must not imply a single right answer.

**Primary action by phase**, timeline ruleset:

| Phase | Primary button | Also present |
|---|---|---|
| `inPlay` | **Place it here** (disabled until a slot is picked) | slots, Pause/Play, Skip |
| `revealed` | **Next song**, or **See final scores** once a team has 10 | Pause/Play |
| `finished` | **Play this deck again** | final standings, "Choose another deck" |

### Game start screen

Everything a game needs, in one place, immediately after the player connects: deck,
mode, teams.

```
┌──────────────────────────────┐
│  New game                    │
│  ┌────────────────────────┐  │
│  │ Test deck              │  │  deck cards, ≥64px, one selected
│  │ 4 songs · 1965–2016    │  │  (amber border)
│  └────────────────────────┘  │
│  … two more decks …          │
│  ┌────────────────────────┐  │
│  │ Songs only             │  │  mode, same card pattern
│  │ You keep the timeline… │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ Timeline in the app    │  │
│  └────────────────────────┘  │
│   Teams      ⊖   2   ⊕       │  timeline mode only, 1–6
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │        Start           │  │  PRIMARY — always a NEW game
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ Resume Rock · round 12 │  │  secondary, only when a save exists
│  └────────────────────────┘  │
└──────────────────────────────┘
```

**Start always starts a new game, and Resume is the only way into a saved one.**
Restoring used to happen just by arriving at the round screen, which left no way to ask
for a fresh game and no way to tell which one you had got. See invariant 4 in
[AGENTS.md](../AGENTS.md).

Resume resumes **what was saved**, not what is selected above — the highlighted deck has
no bearing on a game already in progress. It is absent when there is no save, and also
when there is one that cannot be restored (wrong version, bad shape, a placed card that
left the deck), because it is built by asking `loadGame` for each deck in turn and
taking whatever answers.

Defaults are the saved game's deck and mode if there is one, else the first deck and
`Songs only` — so the shortest path is one tap on Start.

Teams are numbered, never named: a name means a text input and a keyboard over the
screen, for something everyone in the room already knows.

This screen replaced a separate deck-select screen and a `Customise game` screen
reached from the idle round screen. Two places to set one thing, and the setup step was
invisible until after a deck was already chosen.

### Replay visibility — the rule requested

"Replay from start" is **hidden by default** and appears **only when the song has
ended**, replacing the Pause/Play control:

```
hasEnded = durationMs > 0 && positionMs >= durationMs - 1000
```

The 1s tolerance absorbs the SDK's state-update granularity. When `hasEnded`, the
secondary row shows **↻ Replay** instead of Pause.

**Resolved by design rather than by experiment.** The open question was what the SDK
reports at end-of-track when playing a single URI with no context: it may rest at
`position == duration`, or reset `position` to 0. The predicate above only works in
the first case.

Implemented instead as a latch over the **furthest position reached** for the current
card, which is correct under either behaviour — the high-water mark was recorded
before any reset:

```ts
maxPositionRef.current = Math.max(maxPositionRef.current, state.positionMs);
const reachedEnd = maxPositionRef.current >= state.durationMs - 1500;
if (!state.isPlaying && reachedEnd) setHasEnded(true);
```

Reset on `DRAW` and on replay. See `src/ui/useGame.ts`. Accepted edge case: pausing
by hand inside the final 1.5s shows Replay instead of Play.

### Progress bar — dropped

Originally specified as a 3px hairline. **Removed after first use:** it added noise
without earning it, and once Replay is conditional on the song ending there is
nothing the player needs to time. It also made track duration legible, which is a
weak year signal we get nothing for giving away.

### Playback control — centred, and doubles as the indicator

A circular button in the middle of the screen, with a smaller **+15s forward**
button beside it. The circle's ring pulses while audio plays and rests when paused,
so it is both the state indicator and the control.

**It is deliberately far from the footer.** In the first implementation Pause sat
directly above Reveal, which invited mis-taps on the one button you least want to
press by accident. Vertical separation is the fix.

Its icon and label follow playback state: `▶ Play`, `❚❚ Pause`, or `↻ Replay` once
`hasEnded`. The label is text beneath the circle, not icon-only — an unlabelled glyph
is guessy, and there is ample room. Ring animation is disabled under
`prefers-reduced-motion`; the button keeps working.

The forward button (`aria-label="Skip forward 15 seconds"`) jumps playback ahead 15s
and is disabled once `hasEnded` — Replay already covers "the song is over," so
skipping forward past the end has nothing to do.

#### Loading — a fourth state

Between tapping Start or Next song and hearing anything there is a gap, and on a slow
connection it is long. The control previously showed `▶ Play` throughout it, which is
a **lie**: the track is already on its way, and pressing play does nothing. The room
concludes the app is broken.

While a track has been requested and its audio has not started, the circle shows a
spinner, reads **"Loading…"**, and is disabled along with `+15` — there is nothing yet
to pause or seek. The ring pulse is suppressed, because it means "sound is coming out".

**After 15 seconds the label becomes "Still loading — you can skip".** Nothing is
blocked and no error is invented; the host is told the way out rather than left
watching a spinner. Deliberately not an error banner: that could fire on a connection
about to succeed, leaving an error on screen under a track that then starts playing.

Skip and the primary action stay enabled throughout, so a slow load never traps anyone.
The label is shown even in the timeline ruleset's compact control, which otherwise
hides it: under `prefers-reduced-motion` the spinner does not turn, so the words are
the only thing left carrying the state.

What counts as "loaded" is a playback question, answered in
[02-spotify-constraints.md](02-spotify-constraints.md#playtrack-resolving-is-not-audio-starting).

### Other screens

| Screen | Changes |
|---|---|
| **Login** | Centred card, large primary "Sign in with Spotify". No header. |
| **Host setup checklist** | Numbered list, generous line height, primary "Ready" pinned to the bottom. Content unchanged — the S0.1 spike made it load-bearing. |
| **Game start** | Full-width tappable cards, ≥64px: deck name, then muted "32 songs · 1965–2019". Same card pattern for the mode choice. See above. |
| **Deck finished** | Centred, primary "Play this deck again", secondary "Choose another deck". |
| **Not premium / wrong origin / auth error** | Centred card, `--danger` heading, body text, one action. Wording unchanged; all three carry diagnostic detail that has already proved useful. |

---

## Mobile platform specifics

These are the things that make a web app feel wrong on a phone, and each needs an
explicit fix:

- **Safe areas.** Add `viewport-fit=cover` to the viewport meta, then pad the footer
  with `env(safe-area-inset-bottom)` and the header with `env(safe-area-inset-top)`.
  Without this the primary button sits under the iPhone home indicator.
- **Tap targets** ≥48×48px, with ≥8px between adjacent targets.
- **`touch-action: manipulation`** on all buttons to remove the 300ms double-tap-zoom
  delay.
- **No horizontal scroll, ever.** `overflow-x: hidden` on the body plus no fixed
  widths.
- **`overscroll-behavior: none`** so the page does not rubber-band while a round is
  in progress.
- **Full-height layout** using `100dvh`, not `100vh` — `vh` is wrong on mobile Safari
  when the toolbar hides, which would push the primary button off-screen.
- **`-webkit-tap-highlight-color: transparent`**, replaced with an explicit `:active`
  state so presses still feel responsive.
- **Minimum 16px** on any input, to stop iOS zooming on focus. (No inputs exist today;
  the rule is for later.)

## Screen wake lock

The phone locking mid-round while everyone argues about a year is exactly the kind of
small annoyance that spoils a party game.

`useWakeLock()` — a hook that:

- requests `navigator.wakeLock.request("screen")` when the round screen mounts;
- re-acquires on `visibilitychange`, because the lock is released automatically
  whenever the tab is backgrounded;
- releases on unmount;
- **degrades silently** — it is unsupported in some browsers and requires a secure
  context. A failure must never surface an error or interrupt play.

---

## Implementation plan

Not to be started until this document is agreed.

**New files**

| File | Purpose |
|---|---|
| `src/ui/styles.css` | Tokens, base/reset, component classes. Imported once from `main.tsx`. |
| `src/ui/AppShell.tsx` | Header + menu trigger + main region |
| `src/ui/MenuSheet.tsx` | Bottom sheet, focus trap, Escape, scrim |
| `src/ui/useWakeLock.ts` | Wake lock with silent degradation |

**Modified**

- `index.html` — `viewport-fit=cover`
- `src/ui/useGame.ts` — derive and expose `hasEnded`
- `src/ui/RoundScreen.tsx` — three-region layout, conditional primary action,
  conditional replay, progress bar
- `src/ui/GameSession.tsx` — wrap authenticated screens in `AppShell`, own the menu
  actions (`onChangeDeck`, `onSignOut`)
- `src/ui/App.tsx` — move the signed-in line and Sign out button into the shell/menu
- `DeckSelectScreen`, `HostSetupScreen`, `LoginScreen`, `NotPremiumScreen`,
  `AuthErrorScreen`, `WrongOriginScreen` — apply classes
- Remove the three inline styles

**Order:** verify the end-of-track behaviour first (it determines whether the replay
rule is implementable as written) → stylesheet and tokens → AppShell + MenuSheet →
RoundScreen → remaining screens → wake lock.

## Verification

Automated: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all clean. No new
tests are implied — this is presentation, and the engine tests already cover the
spoiler gate that matters.

Manual, on a real phone against the deployed build:

1. Primary button reachable one-handed, clear of the home indicator.
2. No horizontal scroll on any screen; no rubber-banding.
3. Menu opens, traps focus, closes on scrim tap and on Escape.
4. Replay is absent mid-song and appears when the song ends.
5. Screen does not dim during a round.
6. The reveal is legible from across a table.
7. **No spoiler regression:** nothing identifying appears before Reveal, and the OS
   now-playing panel still reads "Song Timeline / Guess the year".

Item 7 is the one that must not be traded away for visual polish.

## Open questions

1. ~~End-of-track SDK behaviour~~ — resolved by design; see the replay section above.
   Still worth eyeballing on a device, but nothing depends on the answer.
2. Whether the progress bar should also hide before reveal. Implemented as always
   visible; revisit if it feels like it gives too much away in play.
