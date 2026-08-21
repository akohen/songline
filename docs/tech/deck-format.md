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
| `year` | Four-digit integer. Year the **credited artist** first released or performed this version. |
| `title` / `artist` | Display only, shown at reveal. Never used for matching. For classical decks, `artist` names the **composer**, not the performer — see curation rule 2. |
| `startOffsetMs` | Playback start position. Use to skip a spoiler-heavy or dead intro. **Omit in iteration 1** — every song starts at 0:00 by decision; the field is honoured but unused. |
| `notes` | Free text for the curator. Useful for recording a judgement call — an ambiguous year, or why a particular recording was chosen. |

## Curation rules

1. **Set the year from a source you trust** — Wikipedia, Discogs or MusicBrainz.
   Whatever you write is what the game uses; there is nothing to reconcile it against.
2. **Year the credited artist first released this version, not the underlying song.**
   A cover by a *different* artist is that artist's own release — Goldfinger's "99 Red
   Balloons" is dated to Goldfinger's release, not Nena's 1983 original, because the
   card credits Goldfinger. A live recording of a song the same artist already
   released in studio form stays dated to that original release — or exclude it; live
   versions are ambiguous and frustrate players.

   For **classical decks**, `artist` names the composer, not the performing orchestra
   or soloist. Different performers recording the same work are not a new artist's
   release the way a cover is, so the year stays the composition/premiere year no
   matter which recording supplies the audio.
3. **When the single and the album differ, use the single.** That is when the song
   actually reached the public, and it is what players remember. This is not
   hypothetical: it decides five cards in `classics-international` — Rolling in the
   Deep (2010 single, 2011 album), Uptown Funk (2014/2015), Happy (2013/2014),
   ...Baby One More Time (1998/1999), One More Time (2000/2001). Record the split in
   `notes` so the choice is visibly deliberate rather than looking like an error.
4. **Prefer the original studio release** of a track over a remaster when both are on
   Spotify, so the audio still sounds like it belongs to the year on the card, even
   though that year no longer depends on which recording you pick.
5. **Avoid**: compilations-only tracks, "Sped Up"/"Slowed" versions, and anything
   whose original release date is genuinely disputed. Re-recordings (e.g. Taylor's
   Versions) are fine as audio — the card still takes the original release year —
   but note the substitution if the production sounds noticeably out of era.
6. **One track per artist per deck**, as a default, to keep variety. This rule can be ignored for thematic decks.

### Deck size and spread

- **At least ~70 cards** for a new deck, and **aim for 100–150**. Enough for a full
  evening, and a large deck surfaces curation problems before you have sunk effort into
  polishing a small one.
- **Balance the decades** — each decade should hold about the same number of cards, so
  the timeline has anchors across the whole range instead of clustering. An incomplete
  decade (one that opens or closes the deck's range and does not span the full ten
  years) can hold fewer. **Bias towards the 90s and 00s**: those decades carry the songs
  most players know best, so weight them a little more heavily than the rest.
- **About 20% of the cards should be less well known**, so that players have to reason
  about the date from era and style rather than recognising the song outright. A deck of
  only hits collapses into pure recall; the harder cards are what make placement a game.
- A wide year range is *easier* to play than a narrow one. A deck spanning 1965–2019
  is a gentler introduction than one spanning 1990–2005.

## Adding tracks and decks

### Adding a track to an existing deck

1. **Find the ID.**

   ```
   pnpm search:tracks "Queen Bohemian Rhapsody" "ABBA Dancing Queen"
   pnpm search:tracks --market=GB "Oasis Wonderwall"      # defaults to FR
   ```

   Prints up to five candidates per query with their ID, album, playability, and
   Spotify's release date.

   **Read the album column, not the date column.** The date is shown only to make
   remasters and compilations visible; it is never the deck year. What you are
   choosing is a *recording*: reject live cuts, remixes, re-recordings, "Sped Up"
   versions and mashups, because they will sound wrong for the year on the card.

   (By hand, if you prefer: Spotify → Share → Copy Song Link, then take the ID from
   `open.spotify.com/track/<ID>?…`.)

2. **Set the year** from Wikipedia, Discogs or MusicBrainz — never from the search
   output. Apply the curation rules above, especially single-versus-album.

3. **Add the card** to the deck's JSON. Fill `notes` if you made a judgement call.

4. **Validate:** `pnpm validate:decks`. Read the output, do not just check it passed —
   it prints the resolved track and album for every card, and that is the only check
   on whether an ID points at the recording you meant.

### Adding a new deck

Steps 1–4 as above, then two more that are easy to miss:

5. **Name the file after the deck id.** `src/decks/<id>.json` with `"id": "<id>"`.
   The validator fails on a mismatch.

6. **Register it in `src/decks/loadDeck.ts`.** A deck file that is not in the `DECKS`
   array is invisible to the app — it will not appear on the game start screen, and
   nothing will warn you.

## Validation

`pnpm validate:decks` checks each deck and exits non-zero on error:

- Schema conformance and unique track IDs.
- `year` is an integer no later than the current year. There is no lower bound —
  `classical` needs years back to the 1600s, and a fixed floor picked for pop/rock
  decks carries no meaning for other genres.
- Every `spotifyTrackId` resolves and comes back playable in the deck's market —
  catching typos, removed tracks and market restrictions before game night rather
  than during it.

**Validate one deck at a time.** `pnpm validate:decks hits-fr` (id or filename, several
allowed) checks only the named deck(s); with no argument it checks all of them. An
unknown name stops with the list of valid decks rather than silently falling back to the
whole set. Scope to the deck you edited — validating everything is hundreds of requests
you rarely need.

**It looks tracks up one at a time.** The bulk endpoint (`GET /v1/tracks?ids=`)
returns **403** for this app regardless of market or batch size, while
`GET /v1/tracks/{id}` works. Batching is simply not available to us, so a deck is one
sequential request per card.

**Requests are paced, and a punitive rate limit aborts fast.** Calls are spaced (~8/s) to
stay under Spotify's rolling window instead of discovering it by tripping a `429`. A
short `Retry-After` is still waited out; anything over 30s is not — Spotify has answered
with tens of thousands of seconds (~24h), which used to hang the run for a day, so past
the cap it aborts with a message telling you to wait or scope to one deck. Pacing is in
`scripts/spotifyApp.ts` and applies to `search:tracks` too.

It does **not** compare `year` against `album.release_date`. Those two fields answer
different questions, so a mismatch carries no information; on a representative deck
it fires on roughly a quarter of the cards and trains you to ignore the output. The
script prints the resolved track and album name instead, so a curator can eyeball
that the ID points at the recording they meant.

Validation requires a Spotify token, so it runs as an explicit `npm run
validate:decks` rather than on every build.

**How the scripts authenticate:** the **Client Credentials** flow, not PKCE. They run
on the curator's machine, so they can hold a client secret from the git-ignored
`.env.local`, and they need no user context. This is the one place a client secret is
used, and it never ships to the browser — `SPOTIFY_CLIENT_SECRET` has no `VITE_`
prefix, which is precisely what keeps it out of the bundle. Shared setup lives in
`scripts/spotifyApp.ts`; `Retry-After` on `429` is honoured.

## Markets

`deck.market` records the market the deck was **validated** against, and that is all
it does. It is used by `pnpm validate:decks` and nowhere else.

The runtime does **not** pass a market when starting playback — `playTrack` sends only
`uris` and `position_ms` — so Spotify's *track relinking* does not apply, and an ID
unavailable in the listener's country will simply fail to play. That failure is
handled: the adapter raises `track_unavailable` and the round screen shows a message
next to Next song, so a bad card costs one round rather than the evening.

The practical consequence is that **a deck is only as validated as its market**.
Validate against the market you actually play in; a deck built and validated for `FR`
carries no guarantee for a listener in `US`.
