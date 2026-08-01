# Song Timeline — Documentation

A party game where players hear a song and must guess its release year, placing it
into a chronological timeline of the songs played so far.

Development is **iterative**. Each document describes the target design; the
[roadmap](05-roadmap.md) says what is actually in scope for each iteration.

## Index

| Document | Purpose |
|---|---|
| [01-game-design.md](01-game-design.md) | Rules, game loop, terminology, what varies between rulesets |
| [02-spotify-constraints.md](02-spotify-constraints.md) | Hard limits imposed by Spotify: auth, playback, metadata leakage, legal |
| [03-architecture.md](03-architecture.md) | Layers, state machine, technology choices |
| [04-deck-format.md](04-deck-format.md) | Schema and curation rules for song decks |
| [05-roadmap.md](05-roadmap.md) | Iteration plan |
| [06-iteration-1-plan.md](06-iteration-1-plan.md) | Step-by-step plan for the iteration in progress |

## Status

Specs reviewed. Iteration 1 planned. No application code exists yet — the next
action is the two de-risking spikes in
[06-iteration-1-plan.md](06-iteration-1-plan.md#step-0--de-risk-before-building).

## Non-negotiable context

1. **Spotify Premium is required** for every host. There is no free-tier fallback:
   the 30-second `preview_url` is deprecated and returns `null` for apps created
   after November 2024.
2. **This app must stay private.** The Spotify Developer Policy prohibits games
   (see [02-spotify-constraints.md](02-spotify-constraints.md#legal)). The app runs
   in Spotify development mode, limited to 25 manually allowlisted users.
3. **Release year comes from our deck data, never from the Spotify API.** Spotify's
   `album.release_date` reports reissue dates for remasters and compilations, which
   would silently break the core mechanic.
