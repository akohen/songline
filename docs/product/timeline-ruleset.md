# Timeline Ruleset

The app takes over the timeline: teams, placement, correctness and score. This is
the first thing the [rulesets table](game-design.md#rules-that-vary-between-rulesets)
was written for, and the first time two real rulesets exist.

Nothing here is built. Marked **Decided** where a call has been made, **Open** where
it has not — an Open item is not a licence to guess.

---

## Two rulesets

**Decided.** The timeline is **optional and off by default**.

| | Default — *blind jukebox* | Timeline |
|---|---|---|
| Timeline | Players keep it on paper | One per team, in the app |
| Teams | None | 1 to N, one team is legal |
| Score | Not tracked | Cards on your timeline |
| Ends when | Deck is exhausted | A team reaches 10 cards |
| App owns | Playback and reveal | Playback, reveal, placement, score |

The default ruleset is the shipped behaviour, unchanged: two events, no teams, no
score. It stays the default because it is the fastest way to start an evening and it
is the version that has actually been played. Adding the timeline must not add a
setup step to the path that already works — see [Setup](#setup).

---

## Rules — the timeline ruleset

**Decided**, all of it.

**Teams.** One timeline per team. A single team is legal and is the solitaire /
co-op mode; it is not a special case in the rules.

**Turn order.** Round-robin over teams, tracked by the app. Each drawn card belongs
to exactly one team's turn.

**Seed card.** Each team starts with one card. Without it the first placement has one
slot and is unconditionally correct, which reads as a bug rather than a rule.

Seeds come **off the draw pile**, so a seeded song cannot come up again later, and N
teams cost N cards before round one. They are dealt on the **first draw**, not when the
game is created — so the pile is shuffled, then seeded, then played.

This puts a trap in the reducer. "First draw" cannot be `round === 0`: a restore rolls
the in-flight card back to the head of the pile and decrements `round`, so a
game saved during round one restores to `round === 0` with seeds already dealt, and
seeding again would deal a second row to every team and consume more of the pile. Seed
on **all timelines being empty** instead, which is false for any restored game that got
past its first draw.

**Placement validity.** A timeline of *n* cards offers *n+1* slots. Slot *i* has
bounds `[left, right]` where `left` is the year of the card above it (or −∞ for the
first slot) and `right` is the year of the card below it (or +∞ for the last).
Placement is correct when `left ≤ year ≤ right` — **inclusive at both ends**.

**Ties are valid.** Two songs from the same year may be placed in either order.
This follows from the inclusive bounds above, and it has two consequences that are
easy to get wrong:

- **A tie has two correct slots** — either side of the equal-year card. Both are
  simply correct; the reveal draws no distinction between them and never tells the
  player there was another right answer.
- **A timeline is non-decreasing, not strictly increasing.** Two 1983 cards sit in
  whatever order they were placed. Never re-derive a card's position by sorting the
  timeline by year — the recorded order is authoritative. Sorting would silently
  reorder tied cards and, worse, make a correct placement look wrong on the next
  round.

**Wrong placement discards the card.** That is the entire cost: nothing is scored,
nothing is added to the timeline, and the card leaves the draw pile as it already
does. There is no discard pile to model.

**When several slots were correct and the player missed all of them,** the reveal
names one of them. Any one will do — there is no "most correct" slot.

**Skip is a free action.** The same team plays again on the next card.

> **Amended during implementation.** This originally read "Next advances the turn,
> Skip does not" — which is unimplementable, because Skip and Next are the *same*
> `DRAW` event and the reducer cannot tell them apart. **The turn advances on the
> placement instead**, inside `REVEAL`-with-slot. A skip is a `DRAW` with no
> intervening placement, so the same team keeps its turn without that having to be
> encoded anywhere. No flag on `DRAW`, and no resurrecting the deleted `SKIP`.

**Victory: first team to 10 cards.**

> **Amended during implementation.** Originally "checked immediately after a correct
> placement". Ending the game there would mean the winning card was never revealed —
> the placement would resolve straight into a scores screen. `REVEAL` therefore never
> ends the game: the winning placement reveals like any other, and the **next `DRAW`**
> sees a winner and moves to `finished` without consuming a card. The footer's primary
> reads "See final scores" at that moment rather than "Next song".

**A deck exhausted before anyone reaches 10 still ends the game,** on the standings as
they stand — the shortfall is not a failure state and nobody plays on. Under the
default ruleset exhaustion ends the game with no winner; here it ends it with a score.

**No tokens. No bonus guesses.** Both remain unbuilt, deliberately, and both are
[iteration 3 material](../roadmap.md#iteration-3--depth).

---

## Setup

Mode and team count are chosen on the **game start screen**, alongside the deck —
everything a game needs, decided in one place before it begins.

```
Connect the player ──▶ Game start
                         │  deck · mode · teams
                         ├─ [ Start ]                  ← always a new game
                         └─ [ Resume — deck, round N ]  ← only if a save exists
```

**Decided.** The screen offers exactly two game settings: **game mode** and **number
of teams**. Nothing else — no team names, no target score, no clip length. Teams are
therefore numbered, not named, and the count is only live once timeline mode is
selected.

The default path stays short: the deck is preselected and `Songs only` is the default,
so an unchanged screen plus one tap on Start is the game that always worked.

**The ruleset is fixed for the life of a game.** There is no mid-game toggle: turning
the timeline on at round 40 would deal empty timelines into a half-played deck.
Changing it means returning to the start screen and pressing Start, which begins a new
game — the old one is simply replaced.

> An earlier revision put mode and teams behind a `Customise game` button on the idle
> round screen, deliberately leaving deck select untouched. That screen is gone: once
> the start page existed there were two places to set one thing, and the button was
> the redundant one.

Seed cards are dealt by the first draw, which Start triggers directly — not here. See
[Rules](#rules--the-timeline-ruleset).

---

## Engine

### `REVEAL` carries the slot; there is no `placed` phase

**Decided.** The event gains an optional payload:

```ts
type GameEvent =
  | { type: "DRAW" }
  | { type: "REVEAL"; slot?: number }   // slot present ⇒ placed there
```

`slot` absent is the default ruleset's reveal. `slot` present is a placement, and it
takes `inPlay` straight to `revealed`.

**Rejected: a `placed` phase between `inPlay` and `revealed`,** which
[game-design.md](game-design.md#what-later-iterations-insert) predicted. Slot
selection is reversible, contains no card data, and is read by nothing but the button
that confirms it — so it belongs in the component, not the engine. A `placed` phase
would exist only to wait for a second tap. This is the same reasoning that deleted
`SKIP` once `DRAW` covered it.

The one real argument for it is iteration 4's simultaneous secret placement, where
every team's placement is recorded before anything is revealed. That is speculative,
and one hypothetical implementation does not justify an abstraction here. Recorded so
that if iteration 4 ever forces the phase back, it is a reversal with a reason and not
a rediscovery.

### `reduce` takes the deck

```ts
reduce(state: GameState, event: GameEvent, deck: Deck): GameState
```

Judging a placement needs the card's release year, and the reducer had no way to see
one. Two alternatives were rejected:

- **Put the year, or the verdict, on the event.** This would mean the *hook* looking up
  the current card's year while the card is still `inPlay` — the exact second route to
  the answer that the spoiler gate exists to prevent. Decisive, and the reason this
  isn't a matter of taste.
- **Keep the deck out and let a selector judge it.** Impossible: whether the card joins
  the timeline is a state transition, so the verdict has to exist before the state does.

The deck is card data, not I/O, and `selectRevealedCard` and friends already take it.
The engine still imports nothing but types, and `reduce` is still pure and total.

### State

Teams are numbered rather than named, so a team has no attributes beyond its cards
and no identity beyond its position:

```ts
/** One team's placed cards, in recorded order — non-decreasing by year, never
 *  re-sorted. Team number is the index; there is no id and no name to store. */
type Timeline = TrackId[]

type GameState = {
  phase: Phase
  deckId: string
  drawPile: TrackId[]
  currentCard: TrackId | null
  round: number

  /** One timeline per team. Empty ⇒ the default ruleset; this is the only mode flag. */
  timelines: Timeline[]
  /** Index into `timelines`. Meaningless, and ignored, when it is empty. */
  currentTeam: number
  /** Output of the last reveal, for rendering the outcome. Null outside `revealed`. */
  lastPlacement: { team: number; slot: number; correct: boolean } | null
}
```

`team` is on `lastPlacement` because the turn has already advanced by the time the
outcome is rendered — the placement belongs to whoever just played, not to whoever is
next, and the screen must keep showing the former's timeline through the reveal.

`timelines: []` encodes "timeline off" rather than a separate boolean, so there is no
pair of fields that can disagree, and team count is `timelines.length` rather than a
second thing to keep in step.

Scores and the winner are **derived**, not stored: a score is `timeline.length`, and
the winner is whoever reached 10 — or, on an exhausted deck, whoever is highest. Two
teams level at the top are simply level; the standings are the result, so nothing needs
breaking a tie.

### Two invariants this must not dent

**Track IDs still never reach the UI — and this is the first time keeping that rule
costs anything.** Not because a placed card is a spoiler: it is already revealed, its
year is on screen, and there is nothing left to leak. The point is about the rule
itself.

Today `currentCard` is the only `TrackId` in state, and no component has ever had a
reason to hold it — the single route out is `selectTrackIdForPlayback`, named so
misuse is obvious in review. `teams[].timeline` is `TrackId[]` and the screen must
render year, title and artist for each entry, so passing the array down as props and
looking up `deck.cards` in the component becomes the *natural* thing to write rather
than a mistake. That is the change.

Resolve them **inside the engine** instead: `selectTeams()` returns
`{ year, title, artist }[]` per team. The cost is one selector, and it keeps
[invariant 1](../../AGENTS.md) absolute — which is what makes any violation of it a
review-stopper instead of a judgement call, and a stray `currentCard` in a component
looks no different from a harmless placed ID.

**This was worth having.** The first draft of the placement screen passed
`selectRevealedCard`'s result — a whole `Card`, `spotifyTrackId` included — straight
into a component as a prop, which is exactly the leak described above and looked
entirely reasonable while writing it. It is now narrowed to the three display fields
at the call site.

**`reduce` stays total.** An out-of-range slot, a placement while `idle`, a reveal
with a slot under the default ruleset: all return the same state reference. A stale
tap must not crash a party.

### Persistence

Teams, timelines, and turn order **can** be restored — they need no audio and reveal
nothing. This is the first state in the app that survives a reload meaningfully, and
it does not weaken
[invariant 4](../../AGENTS.md), which is about `phase`, not about score.

- `SCHEMA_VERSION` goes to `2`. A version-1 save is discarded, as it already is.
- Restore still resumes at `idle`, and the in-flight card still returns to the head
  of the pile with `round` rolled back.
- **`lastPlacement` must be cleared on restore.** It is reveal output; resuming at
  `idle` with it set would render an outcome for a card nobody is playing.
- `currentTeam` survives, so the team who was mid-turn keeps it — the in-flight card
  is replayed for them.
- **A placed card missing from the deck rejects the whole save.** Dropping it, as the
  draw pile does, would silently change that team's score, and a game whose standings
  moved under the players is worse than a lost save. Deliberately stricter than the
  pile, where dropping an unplayed card costs nobody anything.

---

## The screen

**Built.** The layout is specified in
[mobile-ui.md](mobile-ui.md#placement-screen--timeline-ruleset); what matters
here is the rules it encodes.

- **Only the placing team's timeline is on screen**, with a score strip above it for
  everyone else. Three timelines on a phone leaves none of them a thumb-sized slot.
  The strip is hidden for a single team, where it says nothing the timeline doesn't.
- **Selecting a slot is reversible and lives in the component.** Only the confirm
  reaches the engine. This is what makes the `placed` phase unnecessary.
- **The staged reveal is resolved.** The card resolves in place and the year is set
  large and amber — the biggest thing on the placement screen, though nowhere near the
  paper ruleset's full-screen number. Title and artist no longer land a beat before it:
  inside a card that size there is no room for the stagger to read, and the placement
  verdict is what the room is waiting on. A playtest may still overturn this.
- **A missed tie shows both slots it could have gone in.** The feedback must never
  imply there was one right answer when there were two.

## Open questions

- **Whether the verdict should land before the year.** See above — decided by
  construction, not by evidence. The playtest is what settles it.

---

## Prototype — superseded

An interactive mockup drove the design and its interaction was adopted wholesale: the
vertical timeline, tappable gaps, reversible selection, confirm-to-resolve, reveal in
place, and the 76px → 56px playback control.

**The shipped screen is now the reference.** The mockup was built before the rules were
settled and never updated: it shows one timeline with no teams or turn, and its
wrong-placement feedback points at a single destination, which the tie rule
contradicts. It is not worth maintaining alongside the real thing.
