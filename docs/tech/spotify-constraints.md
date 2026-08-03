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

- The app stays in Spotify **development mode**: up to 5 users, each added by hand
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
  button that begins a round is that gesture, so this is a natural fit.
- **`player.activateElement()` is required, and its absence fails silently.** Without
  it the first track of a session transfers to our device and then sits *paused* —
  no sound, no error, nothing in the console. Every subsequent track plays, because
  by then the user has tapped something, which makes the bug look like a
  once-per-session fluke rather than a missing call.

  Spotify's reference: *"Some browsers prevent autoplay of media by ensuring that all
  playback is triggered by synchronous event-paths originating from user interaction
  such as a click… Otherwise it will be in pause state once it's transferred."*

  **"Synchronous event-path" is the constraint that dictates where the call goes.**
  It cannot be in `initialize()`: the player object does not exist until several
  awaits after the click that begins connection, so the gesture is long gone by then.
  It has to sit at the top of `playTrack`. See `src/playback/webPlaybackSdkAdapter.ts`.

  **It also dictates where the first draw goes**, which is less obvious and easier to
  break. Every route into a round — `Start` and `Resume` on the game start screen, and
  `Play this deck again` on the finished screen — calls `drawAndPlay` (`src/ui/`)
  *inside its own click handler*, so `playTrack` is invoked before the handler returns.

  The tempting shortcut is to let the round screen draw itself on mount, from a
  `useEffect`. **Do not.** An effect is a different task, the gesture is gone by then,
  and the failure is silent and once-per-session: the first track transfers and sits
  paused, every later one plays. `drawAndPlay` exists as a separate function precisely
  so this ordering is written down once instead of re-derived at each call site.

  Earlier revisions relied on a `Start` button on the round screen itself. That button
  no longer exists — the game start screen supplies the gesture now — but the
  requirement it was satisfying is unchanged.

#### `playTrack` resolving is not audio starting

Playback is started with `PUT /me/player/play`. That request resolving means Spotify
**accepted the command** — not that a note has been heard. On a slow connection most of
the wait happens afterwards, while the track buffers.

Anything timed off that `await` is therefore wrong: a loading indicator hung on it
disappears while the screen is still silent, which is exactly the stretch worth
reporting.

The honest signal comes from the SDK's `player_state_changed`, which carries both
`loading: boolean` and `track_window.current_track.id`. A track has started when an
event arrives that is **about the track we asked for** *and* is no longer loading:

```ts
state.track_window.current_track?.id === pendingTrackId && !state.loading
```

**Both halves are load-bearing.** Drop the ID check and the *outgoing* track's final
events clear the flag the instant a new song is requested, so the loading state is
never visible. Drop `state.loading` and it clears while the track is still buffering.

The SDK also sends nothing when a track is merely *requested*, so the adapter emits
once itself at the top of `playTrack` — otherwise the indicator does not appear until
the SDK next speaks, which on a bad connection is the whole problem.

**Reading `current_track.id` does not weaken the spoiler gate.** The adapter is
comparing an ID it was handed by its own caller against itself; nothing is learned, and
no ID enters `PlaybackState`. See `src/playback/webPlaybackSdkAdapter.ts`.

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
| OS media notification / lock screen / macOS Now Playing | No — **mitigated** | Media Session metadata overridden with placeholders; verified working, see below |
| Bluetooth speaker or car head unit display | Yes | Unfixable. Warn the host to use a plain analogue/BT speaker without a screen |
| Spotify app on other devices (same account) | Yes | Unfixable. Host should close other Spotify clients; warn in setup |
| Spotify Connect target device screen (mechanism B) | Yes | Why mechanism B is a fallback only |
| Spotify "Recently played" / listening history | After the fact | Harmless mid-game |

### Spike result — Media Session suppression WORKS (2026-08-01)

Verified on macOS 24.6 / Chrome, by inspecting Control Centre during playback:

- **Spotify desktop app closed** → Now Playing reads "Song Timeline / Guess the
  year" with the browser icon. **Suppression holds. No leak.**
- **Spotify desktop app open** → Now Playing shows the real title, artist and album
  art.

The leak is therefore the *other Spotify client on the same account*, not our web
player. The desktop app mirrors account-wide playback state and publishes it to the
OS, overriding what our page set. This is the already-known "another Spotify client"
surface, not a new one, and no client-side code can close it — the other app is
outside our process.

**Consequence: the host setup checklist is load-bearing, not advisory.** Quitting
Spotify everywhere else is the mitigation, and it is the single most important
setup step. The round screen must not ship without it.

The suppression implementation earns its place: re-asserting on every
`player_state_changed` and after each `playTrack` is what produces the clean result
above. Trapping `mediaSession.metadata` writes via `Object.defineProperty` is not
needed.

Two findings that stand regardless:

- **Do Not Disturb does not hide the Now Playing panel** — it suppresses
  notifications, not that widget. Never a viable fallback.
- **Mobile is materially worse than desktop.** Control Centre needs a deliberate
  click, whereas Android renders a media notification on the lock screen and iOS
  shows Now Playing there automatically — passively visible, no interaction needed.
  Another reason iteration 1 hosts on a desktop machine.

**Host setup checklist** (surface this in the app before the first round): close
Spotify on other devices, use a screenless speaker, do not cast to a TV.

## Data accuracy

`album.release_date` is the release date of the *album this track appears on*,
which is not the song's original release year. Remasters, compilations, deluxe
editions and reissues all report the later date. Precision varies (`year`, `month`,
`day`) via `release_date_precision`.

We therefore never read the year from the API. See
[deck-format.md](deck-format.md).

Related: the audio-features, recommendations and related-artists endpoints were
deprecated in November 2024 for new apps. We must not design any feature (automatic
difficulty rating, deck generation by mood) that depends on them.

## Operational limits

- **Rate limiting** is a rolling 30-second window; the API returns `429` with a
  `Retry-After` header. Our request volume is trivial (one track lookup per round),
  and deck validation honours `Retry-After`. Note that the **bulk** track endpoint
  (`GET /v1/tracks?ids=`) returns `403` for this app, so validation cannot batch and
  looks tracks up one at a time via `GET /v1/tracks/{id}`.
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
