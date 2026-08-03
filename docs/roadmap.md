# Roadmap

Each iteration is independently playable. Nothing here is committed beyond
iteration 1 — later iterations are direction, not a plan.

---

## Iteration 1 — Blind jukebox

**Goal:** a real game night works, with the timeline maintained on paper. Shipped and
played; the step-by-step plan that got it there is no longer kept, since its only
lasting content — the two pre-build spikes — is folded into
[tech/spotify-constraints.md](tech/spotify-constraints.md#spike-result--media-session-suppression-works-2026-08-01).

The app plays a random unplayed song from a deck without revealing anything, then
reveals the year on demand. Players do the rest.

- PKCE login, silent refresh, Premium check with a clear error
- Web Playback SDK adapter + `FakePlaybackAdapter`
- Media Session metadata suppression
- Three bundled decks (a 4-card test deck, a 67-card classics deck, a 308-card
  Hitster Rock deck) plus the validation script
- Engine with the round state machine: two events, `DRAW` and `REVEAL`
- Screens: Login → Host setup checklist → Game start → Round (draw / play / pause /
  replay / reveal)
- Session persistence to `localStorage`

**Done:** played end to end across several evenings, with no spoiler leak and no
mid-game token expiry.

**Deliberately excluded:** players, scoring, in-app timeline.

---

## Iteration 2 — The app keeps score

Bring the timeline into the app, replacing the paper cards — **optionally**. The
paper version stays the default.

> Rules, state shape and open questions: [product/timeline-ruleset.md](product/timeline-ruleset.md)

**Built and played.** No issues found.

- Deck, mode and team setup together on a game start screen, with an explicit Resume
- One timeline per team, tap-to-place into a slot, confirm to resolve
- Correctness check, discard on a miss, first team to 10 cards wins
- ~~Introduce the `Ruleset` abstraction~~ — **dropped.** Two real rulesets exist and
  the difference between them is entirely `timelines.length === 0`, which the state
  already encodes. The abstraction would have been a container for one boolean. See
  [tech/architecture.md](tech/architecture.md#still-no-ruleset-parameter).
- Reveal resolves in place on the placed card, not as a full-screen year

**Resolved:** one timeline per *team*, not per player and not shared — a team of one
covers the solitaire case, so per-player needs no separate mode.

---

## Iteration 3 — Depth

- Tokens and stealing (Hitster-like ruleset). Per-player timelines are already
  covered by iteration 2's teams-of-one
- Challenging another team's placement, not just your own turn — the mechanic
  tokens/stealing above would need to cover
- Difficulty labels
- Bonus guesses for title/artist
- Configurable clip length and replay limits
- Web API device adapter as a playback fallback, with a spoiler warning
- A session summary at the end — every song played, so the room can re-listen or
  look an artist up afterwards. Needs the engine to keep what it currently discards:
  right now nothing survives past the round it was drawn in. Spoiler-safe by
  construction — everything on the list has already been through `revealed` — but
  worth designing as a selector alongside the others, not a UI-side accumulation of
  `revealed` cards, for the same reason `selectTeams` resolves IDs inside the engine
  rather than the component.

---

## Iteration 4 — Second screen

Only if single-screen play proves genuinely limiting. This is the first iteration
that requires a backend, and it should not be entered casually.

Motivating gap: the timeline ruleset (iteration 2) only works when everyone can see
one screen, which caps the group size it's good for — "songs only," tracked on paper,
is what large groups already fall back to. Two ways to lift that cap, in increasing
order of cost:

- Mirror the current single screen to a TV — no new mechanic, just a bigger display.
  Might not need a backend at all if it's literally the same page cast or plugged in.
- Room codes, host screen + phone controllers, so each team can see their own
  timeline on their own device
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
| Player disconnects after the app sits backgrounded for a while | Playback silently dead; only fix found so far is a page refresh | Open. Needs investigating whether the SDK exposes a connection-state event we can act on before reaching for a fix |
