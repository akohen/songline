# Spotify Constraints

Everything in this document is a constraint we do not control. The design has to
absorb these rather than work around them.

## Legal

The [Spotify Developer Policy](https://developer.spotify.com/policy), Section III
("Some prohibited applications"), states:

> Do not create a game, including trivia quizzes.

It further prohibits synchronizing sound recordings with visual media, and
segueing/mixing/overlapping Spotify content with other audio.

**Consequences for this project:**

- The app stays in Spotify **development mode**: up to 25 users, each added by hand
  (email + Spotify account) in the developer dashboard.
- We do not request a quota extension. The extension request describes the use case
  and this one is explicitly prohibited.
- Self-hosted, personal use only. No public deployment, no app store, no marketing.
- Design implication, not just legal hygiene: **no album art, no synchronized
  visuals, no audio manipulation.** Two of those we wanted to avoid anyway (album
  art spoils the answer).

If distribution ever becomes a goal, the audio source has to change — self-hosted
audio files, or a licensed provider — not the app.

## Accounts and authentication

- **Spotify Premium is required.** The Web Playback SDK refuses to start for free
  accounts. Mobile-only Premium plans are also excluded.
- **No 30-second preview fallback.** `preview_url` was deprecated in November 2024
  and returns `null` for apps created after that date. There is no free-tier path.
- **No client secret.** A static SPA cannot hold one. Use **Authorization Code with
  PKCE**, which issues refresh tokens to public clients.
- **Access tokens expire after 1 hour.** A game session can outlast that, so silent
  refresh must be implemented from the start — not deferred. Refresh in the
  background, well before expiry; a token refresh that interrupts playback mid-round
  is a visible bug.
- Redirect URIs must be registered exactly, including the dev URL
  (`http://127.0.0.1:5173/callback` — Spotify no longer accepts `localhost`).

### Scopes

| Scope | Why |
|---|---|
| `streaming` | Required by the Web Playback SDK |
| `user-read-email`, `user-read-private` | Required by the SDK; also gives the user's `country` for market-correct track resolution |
| `user-modify-playback-state` | Start/pause/seek, transfer playback to our device |
| `user-read-playback-state` | Read device list and current state |

We request nothing else. No playlist or library scopes are needed.

## Playback

Two mechanisms exist, with different trade-offs:

### A. Web Playback SDK — an in-browser player

The browser becomes a Spotify Connect device. Audio comes out of the host machine.

- Supported on Chrome, Firefox, Safari and Edge, desktop and mobile.
- Requires EME (Widevine/FairPlay). Privacy extensions and content blockers break it.
- **iOS caveat:** playback does not start automatically after transferring playback;
  a user interaction is required to begin audio.
- Autoplay policies mean the first playback must be triggered by a user gesture. The
  "Draw" button is that gesture, so this is a natural fit.

### B. Web API — remote control of an existing device

The user's Spotify desktop/phone app plays; we send REST commands to it.

- Works anywhere, no EME, no SDK.
- Lets audio go to a speaker or hi-fi already set up for Spotify Connect.
- **Leaks the answer** — see below.

**Decision:** the Web Playback SDK is the primary mechanism. Device selection via
the Web API is a later fallback for setups where the SDK fails, with an explicit
spoiler warning.

## Metadata leakage — the defining UX constraint

The game is ruined if any surface shows the track title, artist, album art or year
while the song is playing. Playing audio through a consumer music service means
fighting a stack that is designed to display exactly that. Known leak surfaces:

| Surface | Leaks? | Mitigation |
|---|---|---|
| Our own UI | Controlled | Never render card metadata before REVEALED. Enforce in the engine, not by UI discipline. |
| Browser tab title | Yes, if we set it | Keep the title static |
| OS media notification / lock screen / macOS Now Playing | Yes | Override the Media Session API metadata with neutral placeholders |
| Bluetooth speaker or car head unit display | Yes | Unfixable. Warn the host to use a plain analogue/BT speaker without a screen |
| Spotify app on other devices (same account) | Yes | Unfixable. Host should close other Spotify clients; warn in setup |
| Spotify Connect target device screen (mechanism B) | Yes | Why mechanism B is a fallback only |
| Spotify "Recently played" / listening history | After the fact | Harmless mid-game |

The Media Session override is the one non-obvious piece of engineering here: the
Web Playback SDK populates `navigator.mediaSession.metadata` itself, so we must
re-set it after every track change and verify it sticks.

**Host setup checklist** (surface this in the app before the first round): close
Spotify on other devices, use a screenless speaker, do not cast to a TV.

## Data accuracy

`album.release_date` is the release date of the *album this track appears on*,
which is not the song's original release year. Remasters, compilations, deluxe
editions and reissues all report the later date. Precision varies (`year`, `month`,
`day`) via `release_date_precision`.

We therefore never read the year from the API. See
[04-deck-format.md](04-deck-format.md).

Related: the audio-features, recommendations and related-artists endpoints were
deprecated in November 2024 for new apps. We must not design any feature (automatic
difficulty rating, deck generation by mood) that depends on them.

## Operational limits

- **Rate limiting** is a rolling 30-second window; the API returns `429` with a
  `Retry-After` header. Our request volume is trivial (one track lookup per round),
  but deck validation over hundreds of tracks must batch (`GET /v1/tracks` takes up
  to 50 IDs) and honour `Retry-After`.
- **Track availability changes.** Tracks are removed from the catalogue or become
  market-restricted. Decks rot, hence the validation script.
- **One active playback stream per account.** Two people cannot host simultaneously
  on one account, and the host's own phone playing music will fight the game.

## Summary of requirements this imposes

1. PKCE auth with proactive silent token refresh.
2. Premium detection at login, with a clear failure message rather than a broken player.
3. A metadata-suppression layer covering our UI and the Media Session API.
4. Years sourced from curated deck data, never the API.
5. Market-aware track resolution with graceful skipping of unplayable cards.
6. A pre-game host setup checklist to close the leak surfaces we cannot control.
