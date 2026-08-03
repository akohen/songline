# Song Timeline — Documentation

A party game where players hear a song and must guess its release year, placing it
into a chronological timeline of the songs played so far.

Development is **iterative**. Each document describes the target design; the
[roadmap](roadmap.md) says what is actually in scope for each iteration.

## Index

Read in this order: game design first, then the rest as needed.

### Product

| Document | Purpose |
|---|---|
| [product/game-design.md](product/game-design.md) | Rules, game loop, terminology, what varies between rulesets |
| [product/timeline-ruleset.md](product/timeline-ruleset.md) | The optional in-app timeline: teams, placement, scoring |
| [product/mobile-ui.md](product/mobile-ui.md) | Mobile interface — design system, layouts, interaction rules |

### Tech

| Document | Purpose |
|---|---|
| [tech/spotify-constraints.md](tech/spotify-constraints.md) | Hard limits imposed by Spotify: auth, playback, metadata leakage, legal |
| [tech/architecture.md](tech/architecture.md) | Layers, state machine, technology choices |
| [tech/deck-format.md](tech/deck-format.md) | Schema and curation rules for song decks |
| [tech/deployment.md](tech/deployment.md) | Deploying to Firebase Hosting, for phone play |
| [tech/pwa-installability.md](tech/pwa-installability.md) | Home-screen install (manifest, icons) — not offline support |

### Planning

| Document | Purpose |
|---|---|
| [roadmap.md](roadmap.md) | Iteration plan |

## Status

**Iteration 1 is code-complete and awaiting its first playtest.**

Done: scaffold, engine (pure, spoiler-gated), PKCE auth with silent refresh,
Web Playback SDK adapter, Media Session suppression, three bundled decks (a 4-card
test deck, a 67-card classics deck, a 308-card Hitster Rock deck) with a game start
screen and the validator, host setup checklist, and the round screen. Both
de-risking spikes resolved — suppression works, playback latency is 136 ms.

Deployed to Firebase Hosting for phone play ([tech/deployment.md](tech/deployment.md)).

The mobile interface in [product/mobile-ui.md](product/mobile-ui.md) is built: dark
theme, bottom-sheet menu, one primary action per phase, wake lock.

Next: play a real evening against the acceptance criteria that shipped alongside
iteration 1. The output of that playtest is iteration 2's scope.

**Iteration 2 is built and unplayed.** The **optional** in-app timeline — one per team,
round-robin turns, first to 10 cards — is specified in
[product/timeline-ruleset.md](product/timeline-ruleset.md). Deck, mode and teams are all chosen on
the game start screen, where `Start` always begins a new game and `Resume` is the only
route back into a saved one. The paper ruleset remains the default and is unchanged. Not
yet exercised in a real game with real audio.

## Non-negotiable context

1. **Spotify Premium is required** for every host. There is no free-tier fallback:
   the 30-second `preview_url` is deprecated and returns `null` for apps created
   after November 2024.
2. **This app must stay private.** The Spotify Developer Policy prohibits games
   (see [tech/spotify-constraints.md](tech/spotify-constraints.md#legal)). The app
   runs in Spotify development mode, limited to 5 manually allowlisted users.
3. **Release year comes from our deck data, never from the Spotify API.** Spotify's
   `album.release_date` reports reissue dates for remasters and compilations, which
   would silently break the core mechanic.
