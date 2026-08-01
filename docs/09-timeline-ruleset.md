# Timeline Ruleset

The app takes over the timeline: teams, placement, correctness and score. This is
the first thing the [rulesets table](01-game-design.md#rules-that-vary-between-rulesets)
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
teams cost N cards before round one. They are dealt on the **first Start**, not on the
Customise screen — so the pile is shuffled, then seeded, then played.

This puts a trap in the reducer. "First Start" cannot be `round === 0`: a reload rolls
the in-flight card back to the head of the pile and decrements `round`, so a
game saved during round one restores to `round === 0` with seeds already dealt, and
seeding again would deal a second row to every team and consume more of the pile. Seed
on **all timelines being empty** instead, which is false for any restored game that got
past its first Start.

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

**Skip is a free action.** The same team plays again on the next card. Under the
default ruleset Skip and Next are one `DRAW`; here they diverge — Next advances the
turn, Skip does not.

**Victory: first team to 10 cards.** Checked immediately after a correct placement,
so the game can end mid-deck.

**A deck exhausted before anyone reaches 10 still ends the game,** on the standings as
they stand — the shortfall is not a failure state and nobody plays on. Under the
default ruleset exhaustion ends the game with no winner; here it ends it with a score.

**No tokens. No bonus guesses.** Both remain unbuilt, deliberately, and both are
[iteration 3 material](05-roadmap.md#iteration-3--depth).

---

## Setup

**Decided.** The ruleset is chosen **after selecting a deck and before Start**, via a
new secondary button on the round screen's idle state — alongside Start, not in place
of it.

```
Deck select ──▶ Round screen (idle)
                  ├─ [ Start ]            ← default ruleset, one tap, unchanged
                  └─ [ Customise game ]   ← teams, timeline on
```

The path that works today must stay one tap. Anyone who does not press Customise
gets exactly the current game.

**The ruleset is fixed for the life of a game.** There is no mid-game toggle:
turning the timeline on at round 40 would deal empty timelines into a half-played
deck. Changing it means returning to deck select, which already clears the save
(leaving a deck abandons the game — see [03-architecture.md](03-architecture.md)).

**Decided.** The Customise screen contains exactly two things: **game mode** and
**number of teams**. Nothing else — no team names, no target score, no clip length.

Teams are therefore numbered, not named. Number of teams is meaningless in the default
mode, so the control is only live once the timeline mode is selected.

**Open:** whether the seed cards are dealt on this screen or on the first Start.

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
[01-game-design.md](01-game-design.md#what-later-iterations-insert) predicted. Slot
selection is reversible, contains no card data, and is read by nothing but the button
that confirms it — so it belongs in the component, not the engine. A `placed` phase
would exist only to wait for a second tap. This is the same reasoning that deleted
`SKIP` once `DRAW` covered it.

The one real argument for it is iteration 4's simultaneous secret placement, where
every team's placement is recorded before anything is revealed. That is speculative,
and one hypothetical implementation does not justify an abstraction here. Recorded so
that if iteration 4 ever forces the phase back, it is a reversal with a reason and not
a rediscovery.

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
  lastPlacement: { slot: number; correct: boolean } | null
}
```

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

Resolve them **inside the engine** instead: a `selectTimelines()` returning
`{ year, title, artist }[]` per team. The cost is one selector, and it keeps
[invariant 1](../AGENTS.md) absolute — which is what makes any violation of it a
review-stopper instead of a judgement call, and a stray `currentCard` in a component
looks no different from a harmless placed ID.

**`reduce` stays total.** An out-of-range slot, a placement while `idle`, a reveal
with a slot under the default ruleset: all return the same state reference. A stale
tap must not crash a party.

### Persistence

Teams, timelines, and turn order **can** be restored — they need no audio and reveal
nothing. This is the first state in the app that survives a reload meaningfully, and
it does not weaken
[invariant 4](../AGENTS.md), which is about `phase`, not about score.

- `SCHEMA_VERSION` goes to `2`. A version-1 save is discarded, as it already is.
- Restore still resumes at `idle`, and the in-flight card still returns to the head
  of the pile with `round` rolled back.
- **`lastPlacement` must be cleared on restore.** It is reveal output; resuming at
  `idle` with it set would render an outcome for a card nobody is playing.
- `currentTeam` survives, so the team who was mid-turn keeps it — the in-flight card
  is replayed for them.

---

## Open questions

- **How much of the staged reveal survives.** The presentation follows the
  [prototype](#prototype): the card resolves in place, on the timeline, where it was
  placed. That is **decided**. What is not is whether the current staged beat — title
  and artist alone, then the year a second later — survives inside the smaller card, or
  whether correct-or-not has to land first because the placement is now the question
  the room is waiting on. Worth deciding from a playtest rather than from the mockup.
- **Whether the timeline is visible during the default ruleset.** It cannot be — there
  is none — but the round screen now has two quite different layouts, and
  [08-mobile-ui.md](08-mobile-ui.md) has not been reconciled with the second one.

---

## Prototype

An interactive mockup of the placement screen exists and its **interaction is adopted**:
a vertical timeline with years down the left, the gaps between them as full-width
tappable slots, selection reversible, a confirm resolving it, the reveal landing in
place on the card, and playback shrinking from 76px to 56px to free the vertical space.

It was built before these rules, and two things in it are now **wrong**:

- It shows one timeline with no teams and no turn.
- Its wrong-placement feedback points at a single destination, which the tie rule
  contradicts — two slots can be correct.

Bring it in line before implementing, or work from this document rather than from it.
