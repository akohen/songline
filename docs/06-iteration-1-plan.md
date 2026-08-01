# Iteration 1 — Implementation Plan

**Goal:** a real game night works, with the timeline maintained on paper.

The app is a blind jukebox: it draws an unplayed song from a deck, plays it while
revealing nothing, and shows the year on demand. Players handle placement and
scoring themselves with paper cards.

---

## Step 0 — De-risk before building

Two unknowns can invalidate the design. Both are timeboxed throwaway spikes in a
single scratch page, not production code. **Do these first.**

### S0.1 — Media Session suppression — ✅ RESOLVED, suppression works

Verified 2026-08-01 on macOS/Chrome. With the Spotify desktop app closed, Control
Centre shows "Song Timeline / Guess the year". With it open, the desktop app
publishes the real track and overrides us. Full result in
[02-spotify-constraints.md](02-spotify-constraints.md#spike-result--media-session-suppression-works-2026-08-01).

**The round screen is unblocked**, and the host setup checklist is promoted from
advisory to required: quitting Spotify elsewhere is the only mitigation for the one
surface we cannot control.

Original spike brief follows.



The premise "nothing on screen identifies the song" is worthless if macOS Now Playing,
the Windows media overlay or the browser's own media controls display the title
anyway.

- Authenticate, start a track through the Web Playback SDK, then overwrite
  `navigator.mediaSession.metadata` with neutral placeholders.
- Re-apply on every `player_state_changed` — the SDK sets it itself and will
  overwrite ours.
- **Check the OS surfaces, not the page:** macOS Control Centre / Now Playing,
  the media notification, and the browser's own media button popup.
- Test in Chrome and Safari.

**If suppression cannot be made to stick,** the mitigation shifts from software to
setup: the host runs fullscreen with notifications suppressed (macOS Do Not Disturb),
and the checklist in S5.1 becomes load-bearing rather than advisory. Decide this
before writing the round UI, because it changes what that screen promises.

### S0.2 — SDK playback smoke test — ✅ RESOLVED

Verified 2026-08-01: **tap → play accepted in 136 ms**, and `position_ms` correctly
honours a start offset.

136 ms is fast enough that the Draw button needs no loading state — one less thing
for the round screen to handle.

**Decision: iteration 1 starts every song at 0:00.** Offsets are proven to work but
add curation effort per card for no benefit yet. This requires no code: cards simply
omit `startOffsetMs`, and `selectStartOffsetMs` already returns 0 for those — so the
capability stays live and untouched until a later iteration populates the field.

Original spike brief follows.



- PKCE login → SDK init → device appears → `PUT /v1/me/player/play` with
  `device_id`, `uris`, and `position_ms`.
- Measure time from tap to audible audio. If it is seconds, the Draw button needs a
  loading state and the round UI needs to not look broken while it waits.
- Confirm `position_ms` actually honours `startOffsetMs`.
- Confirm playback survives a 1-hour token refresh (or at least that refresh does not
  interrupt it).

---

## Step 1 — Foundations

- `npm create vite` — React + TypeScript, strict mode on
- Vitest, ESLint, Prettier
- Dev server pinned to `http://127.0.0.1:5173`
- Spotify app registered; redirect URI `http://127.0.0.1:5173/callback`; own account
  added to the dev-mode allowlist
- `.env` for the client ID (and the secret used only by the deck script), git-ignored

## Step 2 — Auth

- PKCE: verifier/challenge generation, authorize redirect, code exchange
- Token store in `localStorage`; refresh scheduled at ~80% of lifetime
- `GET /v1/me` on load → verify `product === 'premium'`, capture `country` for
  market-correct track resolution
- Login screen; explicit, non-generic errors for "not Premium" and "not allowlisted"

**Done when:** the app survives a page reload and a token expiry without re-login.

## Step 3 — Engine (no Spotify, no browser)

Pure TypeScript, developed test-first. This is where correctness lives.

- Types from [03-architecture.md](03-architecture.md); `reduce(state, event)` with
  two events, `DRAW` and `REVEAL`. No ruleset parameter yet.
- Shuffle and draw-without-repeat; an empty pile moves to `finished`
- Selectors, including the spoiler gate
- Serialise/deserialise `GameState` to `localStorage` on every event

**Tests that matter most:** `selectRevealedCard` returns `null` in every phase except
`revealed`; drawing never repeats a card; the pile emptying ends the game cleanly.

**Done when:** a full game can be played through the reducer in tests, with no UI.

## Step 4 — Playback

- `PlaybackPort` interface
- `FakePlaybackAdapter` — silence on a timer. **Build this before the SDK adapter**;
  it unblocks all UI work and makes the UI testable without Premium or network.
- `WebPlaybackSdkAdapter` — init, device transfer, play at offset, pause/resume/seek
- Metadata suppression, per the S0.1 outcome
- Playback errors surface to the round screen as a message next to the Next song
  button — the recovery is the button that is already there

## Step 5 — Deck

Curation is human work with no code dependency — it can run in parallel from day one.

- `Deck`/`Card` types, JSON loader, bundled decks, a deck-select screen
- **First deck: international hits, 1960–2020.** Broadly recognisable anglophone
  pop/rock across six decades. The wide year spread makes it the easiest deck to
  play, which is what a first playtest wants — validate the game, then tune
  difficulty.
- Shipped past the original ~30-card target: `classics-international` grew to 67
  cards and a second deck, `hitster-rock` (308 cards), was added alongside it, plus
  a 4-card `test-deck` for trying the app without spoiling real cards.
- Aim for even decade coverage (~5 cards per decade) so the timeline has anchors
  across the whole range rather than clustering.
- `scripts/validate-decks.ts` using Client Credentials — schema, playability in
  market, and the "year matches Spotify but `notes` is empty" warning

## Step 6 — UI

Built against `FakePlaybackAdapter` throughout.

- **Host setup checklist** — close Spotify elsewhere, screenless speaker, don't cast.
  Not decoration, and no longer merely advisory: the S0.1 spike proved that a running
  Spotify desktop app puts the answer in macOS Control Centre, and that no code of
  ours can prevent it. Quitting Spotify is the mitigation.
- **Deck select** — shipped with three decks rather than the one originally planned
- **Round screen** — round number, cards remaining, play/pause, skip forward 15s,
  replay, Reveal, and Start/Next song. Nothing else: no album art, no waveform, no
  tab-title updates.
- **Reveal** — title and artist first, year ~1s later, large
- Resume-in-progress-game prompt on load

## Step 7 — Playtest

Play a real evening. Keep a notes file. The output of this step is iteration 2's
scope — particularly the shared-vs-per-player timeline question, which is not worth
deciding from an armchair.

---

## Acceptance criteria

1. Host logs in with Premium and reaches a playable round in under 30 seconds.
2. From Draw to Reveal, no surface — app, tab title, OS media UI — identifies the
   track. Verified by looking at Control Centre mid-round, not by reading the code.
3. Drawing 30 times in a session produces 30 distinct songs.
4. A card that fails to play is recovered by pressing Next song, without reloading.
5. The song keeps playing after Reveal, until Next song is pressed.
6. A page refresh mid-game restores the round number and the draw pile.
7. A session lasting over an hour never interrupts playback for a token refresh.
8. `npm run validate:decks` passes on the bundled decks.

## Explicitly out of scope

Players, scoring, in-app timeline, placement UI, device selection, tokens, steals,
clip-length limits, any backend.

Multiple decks and a deck-select screen were originally on this list too, but
shipped as part of iteration 1 anyway — see Step 5 above.

**Cross-session repeat memory is out of scope** — each session starts from the full
deck. Decided deliberately: it avoids extra persistence and a "reset deck" control
in the first iteration. The cost is that with ~30 cards, repeats will be noticeable
on a second game night. Growing the deck is the intended answer; if it becomes
annoying anyway, per-deck played-ID tracking in `localStorage` is a small,
self-contained addition.

---

## Sequencing

Steps 3 (engine) and 5 (deck curation) have no dependency on Spotify working, and
step 5 has no dependency on code at all. If S0.1 goes badly, those two continue while
the metadata question is resolved.

```
S0 spikes ──┬── S1 ── S2 ─────────── S4 (SDK adapter) ──┐
            │                                            ├── S6 UI ── S7 playtest
            ├── S3 engine ──────────── S4 (fake) ────────┤
            └── S5 deck curation ────────────────────────┘
```
