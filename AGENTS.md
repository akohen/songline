# Song Timeline — agent instructions

A party game: a song plays, players guess its release year and build a chronological
timeline. React + TypeScript + Vite, Spotify Web Playback SDK, deployed to Firebase.

---

## How to work in this codebase

**Explain before you edit.** Before the first change of any task, say what you intend
to do: which files, what change, and why. Then wait.

Reading, grepping and running read-only commands need no permission — investigate
freely and thoroughly. The gate is on *mutation*: the first Write, Edit, or
state-changing command.

Approval is **per plan, not per edit**. Once a plan is agreed, carry it out fully
without checking in at every step.

**Finding a problem is not authorization to fix it.** "Is X sufficient?", "check X",
"are the instructions complete?" ask for an *assessment*. Reporting the gaps is the
deliverable. Proposing fixes is welcome; applying them unasked is not.

**Don't assume — ask, and stop if you are confused.** A question costs a minute; a
confident wrong turn costs an afternoon and has to be unpicked. If two readings of a
request would produce materially different work, ask which. If you are lost, say so
and stop rather than guessing forward.

**Keep it simple, and do not build beyond what was asked.** This project has
repeatedly *removed* things and been better for it: the `Ruleset` abstraction was
dropped until there are two real rulesets, the `SKIP` event was deleted once `DRAW`
covered it, the progress bar was removed after one use. Prefer deleting to adding.
An abstraction with one implementation is a liability.

**Change only what the current goal requires.** No opportunistic refactors, no
drive-by renames, no reformatting untouched files. If you spot something worth
fixing, mention it and leave it.

**Propose extra work; don't just do it.** If a request seems to imply a related
improvement, say so and let the user decide. Doing more than asked is not generosity
— it makes the diff harder to review and quietly moves the goalposts.

**Documentation drives the work.** Write or update the relevant doc under
`docs/product/`, `docs/tech/`, or `docs/roadmap.md`
**first**, get agreement, then implement. Keep docs current
as behaviour changes, and record decisions that were *reversed* along with why — the
progress bar is documented as "dropped after first use", not silently deleted.
`docs/README.md` indexes everything and is the design authority.

**Verify before you assert a cause.** Distinguish "I have observed this" from "this
would explain it". Run the experiment that separates the hypotheses. This has gone
wrong twice: an OAuth pre-flight was claimed to validate the redirect URI when a
deliberately bogus URI produced the identical response, and a silent-first-song bug
was diagnosed as an autoplay restriction when the real cause was stale persisted
state. When a reported symptom does not fit your theory, re-diagnose — do not defend.

**Say plainly what you did not verify.** Report what was checked, what passed, and
what still needs a human — anything involving a real phone, audio, or the OS
now-playing panel is unobservable from here. Naming that gap is what gets it closed.
Never describe something as working when it was only built.

**Never weaken a guarantee to fix a symptom.** The spoiler gate and the engine's
purity are load-bearing. If a fix requires relaxing one, that is a design discussion,
not an implementation detail.

**Update tests deliberately, and say so.** When behaviour changes, existing tests
will fail — rewrite them to encode the new intent and call it out explicitly.
Silently adjusting a failing assertion is how a real check disappears.

**Ask before anything outward-facing or hard to reverse** — commits, pushes, deploys,
anything that leaves this machine. Do not commit unless asked.

**Comments explain *why*, not *what*.** The code says what it does. Comments carry the
constraint, the failure that motivated it, or the alternative that was rejected. Most
of the Spotify workarounds here are incomprehensible without one.

---

## Invariants — do not break these

### 1. Nothing may identify the song before the reveal

This is the game. It is enforced in the engine, not by UI discipline:
`selectRevealedCard()` returns `null` in every phase but `revealed`, and it is the
only route to a card's year, title or artist.

- Never add album art, waveforms, track duration in figures, or a dynamic tab title.
- Never put `spotifyTrackId` into React state, props or the DOM — it is one lookup
  away from being the answer. `selectTrackIdForPlayback()` exists for the playback
  adapter alone.
- `src/engine/selectors.test.ts` iterates every phase and asserts the gate. If you
  add a `Phase`, that test forces you to consider it. Keep it that way.

**A subtler failure already hit here:** the gate guarantees the UI cannot reach the
card early, not that the *phase itself* is legitimate. A restored save in `revealed`
put the answer on screen with the gate working perfectly. Wherever `phase` can be set
from outside the reducer, ask whether that phase is earned.

### 2. Release years come from the deck, never from the Spotify API

`album.release_date` answers "when was this *release* put out", not "when did this
song come out". Hey Jude resolves to 1973 or 2006 depending on the compilation. The
error is silent and would score players against a wrong year.

The deck JSON is authoritative. Nothing at runtime or in validation compares the two.

### 3. The engine is pure

`src/engine/` imports nothing and touches no I/O. `reduce(state, event)` is total —
unhandled combinations return **the same state reference**, never a throw, because a
stale click must not crash a party mid-game.

Playback state (`isPlaying`, `positionMs`) belongs to the adapter and must never be
mirrored into `GameState`. The UI composes the two.

### 4. Restore only what can actually be restored

A restored game always resumes at `idle`. Audio cannot survive a reload, so restoring
`inPlay`/`revealed` yields a card nobody can hear — or the answer on screen. See
`src/engine/persistence.ts`.

**Restoring is never implicit.** `Start` on the game-start screen always calls
`createGame`; `Resume` is the only route back into a save. Nothing else reads one.

This replaced an earlier rule — "an explicit deck change clears the save, a reload
resumes it" — which existed only because *arriving* at the round screen was itself the
resume, so leaving had to destroy the game to avoid it silently reappearing. Once
Resume became a button both paths simply return to the start screen and offer it, and
the distinction had nothing left to protect. Leaving a game no longer clears it; the
save dies when `Start` mounts a new game over it.

---

## Verification

Run before claiming anything works:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- `pnpm format` fixes formatting. **CI runs `pnpm lint`, so a formatting failure
  breaks the deploy.**
- `pnpm validate:decks` checks every deck's IDs resolve and are playable. Run it
  after touching any deck — **scope it to the deck you changed**, `pnpm validate:decks
  <deck-id>`, since validating all of them is hundreds of requests you rarely need
  (requests are paced to stay under the rate limit, and a punitive `Retry-After` aborts
  rather than hanging). It deliberately does *not* compare years — read its output to
  confirm each ID points at the intended *recording*, since a live cut or remix is the
  failure that matters and no script can judge it.
- `pnpm search:tracks "artist title"` finds candidate track IDs when curating.

**Adding tracks or decks: follow the procedure in
[docs/tech/deck-format.md](docs/tech/deck-format.md#adding-tracks-and-decks).** It exists
because two steps are silently skippable — a new deck must be registered in
`src/decks/loadDeck.ts` or it never appears, and the year must come from an external
source rather than the search output.

---

## Toolchain

- **pnpm**, not npm. There is no `package-lock.json`; `npm ci` fails.
- **TypeScript 7** — `baseUrl` was removed; `paths` resolve relative to the config.
- **Vite 8**, `@` aliases `src/`. `strict` plus `noUncheckedIndexedAccess`.
- **Biome** for lint *and* format. No ESLint, no Prettier.
- Styling is one global stylesheet, `src/ui/styles.css`. No framework, no CSS
  modules, dark theme only. Avoid inline styles except genuinely dynamic values.

**Check port 5173 before starting a dev server** — the user usually has one running
and `strictPort` means yours will fail:
`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/`

---

## Spotify — the expensive lessons

- **`GET /v1/tracks?ids=` (bulk) returns 403 for this app.** Single-track
  `GET /v1/tracks/{id}` works. Not an auth or market problem; do not retry the batch
  endpoint.
- **`player.activateElement()` must be reachable synchronously from a click.** Without
  it the first track of a session transfers and sits paused — silent, no error. It
  cannot live in `initialize()` (the player does not exist until several awaits after
  the click), so it sits at the top of `playTrack`.

  This reaches further up than the adapter. Every route into a round — `Start` and
  `Resume` on the game start screen, `Play this deck again` on the finished screen —
  calls `drawAndPlay` **inside its own click handler**, so `playTrack` runs before the
  handler returns. Drawing from a `useEffect` on mount looks equivalent and is not: the
  gesture is gone, and it fails silently on the first track only.
- **`redirect_uri` must match byte for byte**, including the trailing slash, and
  Spotify allows no wildcards. It is read from `VITE_SPOTIFY_REDIRECT_URI`, never
  derived from `window.location` — deriving it was itself a bug. A mismatch fails only
  *after* the consent screen, so `checkOrigin()` catches it beforehand. The value must
  agree across `.env.production.local`, the Spotify dashboard, and the GitHub
  repository variable.
- **A `403` from `GET /v1/me` means the account is not on the dev-mode allowlist**
  (5 users max), not that something is broken.
- **Premium is required and there is no fallback.** `preview_url` is deprecated and
  `null` for apps created after Nov 2024. Mobile-only Premium plans report
  `product: "premium"` but the SDK still refuses them.
- **A running Spotify client on any device publishes the real title and artwork to the
  OS**, overriding our Media Session placeholders. Unfixable in code — the host setup
  checklist is the mitigation, which is why that screen is load-bearing.
- **Spotify's Developer Policy prohibits games.** The app stays in development mode,
  self-hosted, personal use. Do not request a quota extension, do not publicise the
  URL, do not add album art or synchronized visuals.

---

## Secrets and files

- `SPOTIFY_CLIENT_SECRET` must **never** gain a `VITE_` prefix — that absence is the
  only thing keeping it out of the browser bundle. Only
  `scripts/validate-decks.ts` uses it.
- The client ID is public by design (PKCE) and correctly appears in the bundle.
- `.env.local` is loaded in *every* mode including `pnpm build`;
  `.env.production.local` overrides it for production builds. Neither is committed, so
  CI supplies both `VITE_` values as GitHub repository variables.
- Never commit `.agents/`, `.claude/skills/`, `skills-lock.json`, or any `.env*.local`
  — all gitignored, all written by `firebase init` or local tooling.
