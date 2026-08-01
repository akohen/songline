# Roadmap

Each iteration is independently playable. Nothing here is committed beyond
iteration 1 — later iterations are direction, not a plan.

---

## Iteration 1 — Blind jukebox

**Goal:** a real game night works, with the timeline maintained on paper.

> Detailed step-by-step plan: [06-iteration-1-plan.md](06-iteration-1-plan.md)

The app plays a random unplayed song from a deck without revealing anything, then
reveals the year on demand. Players do the rest.

- PKCE login, silent refresh, Premium check with a clear error
- Web Playback SDK adapter + `FakePlaybackAdapter`
- Media Session metadata suppression
- Three bundled decks (a 4-card test deck, a 67-card classics deck, a 308-card
  Hitster Rock deck) plus the validation script
- Engine with the round state machine: two events, `DRAW` and `REVEAL`
- Screens: Login → Host setup checklist → Deck select → Round (draw / play / pause /
  replay / reveal)
- Session persistence to `localStorage`

**Done when:** a full evening is played end to end with no spoiler leak and no
mid-game token expiry.

**Deliberately excluded:** players, scoring, in-app timeline.

---

## Iteration 2 — The app keeps score

Bring the timeline into the app, replacing the paper cards — **optionally**. The
paper version stays the default.

> Rules, state shape and open questions: [09-timeline-ruleset.md](09-timeline-ruleset.md)

**Built, and not yet played.** Awaiting the same thing iteration 1 is: a real evening.

- Team setup behind a "Customise game" button on the idle round screen
- One timeline per team, tap-to-place into a slot, confirm to resolve
- Correctness check, discard on a miss, first team to 10 cards wins
- ~~Introduce the `Ruleset` abstraction~~ — **dropped.** Two real rulesets exist and
  the difference between them is entirely `timelines.length === 0`, which the state
  already encodes. The abstraction would have been a container for one boolean. See
  [03-architecture.md](03-architecture.md#still-no-ruleset-parameter).
- Reveal resolves in place on the placed card, not as a full-screen year

**Resolved:** one timeline per *team*, not per player and not shared — a team of one
covers the solitaire case, so per-player needs no separate mode.

---

## Iteration 3 — Depth

- Tokens and stealing (Hitster-like ruleset). Per-player timelines are already
  covered by iteration 2's teams-of-one
- Difficulty labels
- Bonus guesses for title/artist
- Configurable clip length and replay limits
- Web API device adapter as a playback fallback, with a spoiler warning

---

## Iteration 4 — Second screen

Only if single-screen play proves genuinely limiting. This is the first iteration
that requires a backend, and it should not be entered casually.

- Room codes, host screen + phone controllers
- Realtime sync (websockets), backend, room lifecycle
- Simultaneous secret placement, revealed together

---

## Explicitly not planned

- Public deployment or distribution — prohibited by the Spotify Developer Policy
- Automatic deck generation from playlists — release years are not reliable enough
- Anything using audio-features or recommendations — deprecated endpoints
- Album art, lyrics, or synchronized visuals — spoilers and policy

---

## Risk register

| Risk | Impact | Response |
|---|---|---|
| Spotify Developer Policy prohibits games | Cannot distribute | Accepted. Private dev-mode app only. |
| Every host needs Premium | Limits who can host | Accepted. No fallback exists. |
| Web Playback SDK fails on a given browser/extension setup | Unplayable on that machine | Iteration 3 Web API fallback; document known-good setups |
| Metadata leaks via a surface we do not control | Ruins the round | Host setup checklist; prefer a screenless speaker |
| Deck rot — tracks removed or market-restricted | Broken round mid-game | Validation script run before each session; skip-and-log at runtime |
| Curation effort underestimated | Content bottleneck | Start at ~60 cards; treat deck-building as ongoing, not a phase |
