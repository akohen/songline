# Deck Format

Decks are JSON files bundled with the app at build time. They are the **sole source
of truth for release years**. Spotify supplies audio and nothing else.

## Why decks are curated, not generated

A card is just **the year we decide** plus **the ID of the audio to play**. Nothing
else is needed, and Spotify's `album.release_date` is not consulted at any point —
not at runtime, not at validation.

That is deliberate rather than incidental. `release_date` answers "when was this
*release* put out", not "when did this song come out": Hey Jude comes back as 1973
or 2006 depending on which compilation the copy sits on, and remasters, deluxe
editions and reissues all behave the same way. Rather than reconcile against a field
that means something different from what we need, we ignore it.

Curation also buys control over difficulty and lets us guarantee the deck is
actually playable.

### What the curator does have to check

The track ID must point to a recording that **matches the year**. A live cut, a
remix, a re-recording or a "Love"-style mashup will sound wrong for the era players
are being asked to place, even when the year on the card is correct. This is a
judgement made by reading the track and album names when choosing the ID — not a
date comparison, and not something a script can decide.

## Schema

```jsonc
{
  "id": "classics-fr",              // stable slug, matches filename
  "name": "Classiques francophones",
  "description": "Variété et chanson française, 1960–2020",
  "language": "fr",
  "market": "FR",                   // market this deck was validated against
  "cards": [
    {
      "spotifyTrackId": "4uLU6hMCjMI75M1A2tKUQC",   // also the card's identity
      "year": 1971,                 // ORIGINAL release year. Authoritative.
      "title": "Imagine",
      "artist": "John Lennon",
      "startOffsetMs": 0,           // optional, default 0
      "notes": "1971 original; Spotify album is the 2010 remaster (reports 2010)"
    }
  ]
}
```

### Field rules

| Field | Rule |
|---|---|
| `id` (deck) | Lowercase kebab-case. Must equal the filename stem. |
| `market` | ISO 3166-1 alpha-2. The market `validate:decks` checked against. |
| `spotifyTrackId` | Base-62 track ID, not a URI or URL. Unique within the deck, and doubles as the card's identity for "already played" tracking — a separate card ID would be bookkeeping with no payoff. |
| `year` | Four-digit integer. Year of **first commercial release** of *this recording*. |
| `title` / `artist` | Display only, shown at reveal. Never used for matching. |
| `startOffsetMs` | Playback start position. Use to skip a spoiler-heavy or dead intro. **Omit in iteration 1** — every song starts at 0:00 by decision; the field is honoured but unused. |
| `notes` | Free text for the curator. Useful for recording a judgement call — an ambiguous year, or why a particular recording was chosen. |

## Curation rules

1. **Set the year from a source you trust** — Wikipedia, Discogs or MusicBrainz.
   Whatever you write is what the game uses; there is nothing to reconcile it against.
2. **Year of the recording, not the song.** A 1994 cover of a 1965 song is 1994.
   A live 2003 recording of a 1978 song is 2003 — or exclude it; live versions are
   ambiguous and frustrate players.
3. **Prefer the original studio release** of a track over a remaster when both are on
   Spotify, so that the audio matches the year even if the listener recognises the
   production.
4. **Avoid**: compilations-only tracks, "Sped Up"/"Slowed" versions, re-recordings
   (e.g. Taylor's Versions) unless the re-recording year is what you intend, and
   anything whose release date is genuinely disputed.
5. **One track per artist per deck**, as a default, to keep variety.

## Validation

A script checks each deck and exits non-zero on error:

- Schema conformance and unique track IDs.
- `year` is between 1900 and the current year.
- Every `spotifyTrackId` resolves via `GET /v1/tracks?market=…` and comes back
  playable — catching typos, removed tracks and market restrictions before game
  night rather than during it.

It does **not** compare `year` against `album.release_date`. Those two fields answer
different questions, so a mismatch carries no information; on a representative deck
it fires on roughly a quarter of the cards and trains you to ignore the output. The
script prints the resolved track and album name instead, so a curator can eyeball
that the ID points at the recording they meant.

Validation requires a Spotify token, so it runs as an explicit `npm run
validate:decks` rather than on every build.

**How the script authenticates:** the **Client Credentials** flow, not PKCE. It runs
on the curator's machine, so it can hold a client secret in a git-ignored `.env`,
and it needs no user context — `GET /v1/tracks` accepts an app token and an explicit
`market` parameter. This is the one place a client secret exists, and it never ships
to the browser.

Batch up to 50 IDs per request and honour `Retry-After` on `429`.

## Track relinking and markets

A track ID valid in one market may be unavailable in another; Spotify's *track
relinking* can substitute an equivalent ID when a `market` parameter is supplied.
Decks therefore record the market they were validated against, and the runtime
passes the user's market so relinking applies. A card that cannot be resolved at
runtime is skipped and logged, never surfaced as a broken round.
