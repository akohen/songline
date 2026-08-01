# Deployment — Firebase Hosting

Deploying exists for one reason: **playing on a phone**. The dev server cannot serve
one, because the Web Playback SDK needs a secure context and Spotify redirect URIs
cannot be wildcards, so a LAN IP is unusable. Firebase Hosting supplies HTTPS and a
stable URL, which resolves both.

## Scope and policy

The Spotify Developer Policy prohibits games, so this app stays in **development
mode** — capped at 25 manually allowlisted accounts. See
[02-spotify-constraints.md](02-spotify-constraints.md#legal).

A Firebase URL is publicly reachable, but only allowlisted Spotify accounts can sign
in, so it is effectively private. Do not publicise the URL, and do not request a
quota extension.

## One-time setup

1. **Create/choose a Firebase project**

   ```
   firebase login
   firebase use --add        # pick the project, give it an alias
   ```

   `firebase.json` is already committed. It serves `dist/`, rewrites everything to
   `index.html`, and sets long cache headers on hashed assets while keeping
   `index.html` uncached.

2. **Register the redirect URI with Spotify**

   In the developer dashboard, add your hosting URL as a **second** redirect URI —
   keep `http://127.0.0.1:5173/` so local development still works. Spotify allows
   several.

   ```
   https://YOUR-PROJECT-ID.web.app/
   ```

   The trailing slash is part of the value.

3. **Point the production build at it**

   Edit `.env.production.local` (git-ignored) and replace the placeholder:

   ```
   VITE_SPOTIFY_REDIRECT_URI=https://YOUR-PROJECT-ID.web.app/
   ```

   **Why a separate file:** Vite loads `.env.local` in *every* mode, including
   `pnpm build`. Without this override the deployed bundle would ship the
   `127.0.0.1` redirect URI and sign-in would fail after the consent screen.
   `.env.production.local` takes precedence for builds only; `pnpm dev` is unaffected.

## Deploying

```
pnpm deploy        # runs pnpm build, then firebase deploy --only hosting
```

Verify after the first deploy that the bundle carries the right URI:

```
grep -o 'https://[a-z0-9-]*\.web\.app/' dist/assets/*.js
```

If the deployed app shows a **"Wrong address"** screen, the page origin and the
configured redirect URI disagree — the screen states both values. Usually it means
`.web.app` was registered but the site was opened at `.firebaseapp.com`, or vice
versa. Pick one and use it everywhere.

## What never ships

`SPOTIFY_CLIENT_SECRET` has no `VITE_` prefix, so Vite does not inline it and it
cannot reach the bundle. Only the deck validator uses it, and that runs locally.
The client ID *is* in the bundle, which is correct — PKCE public clients have no
secret to protect.

## Playing on a phone — what to expect

**iOS caveat, from Spotify's own docs:** *"The playback does not start automatically
after transferring playback. The user must interact with the SDK events to play
audio."* Our flow starts playback from a button tap, which should satisfy this, but
it is unverified on iOS.

**The spoiler surface is worse on a phone.** On desktop, Control Centre has to be
opened deliberately. A phone renders now-playing on the lock screen with no
interaction at all. Our Media Session suppression drives that same surface, so it
should read "Song Timeline / Guess the year" — but this has only been verified on
macOS.

**Quit the Spotify app on the phone itself.** The S0.1 spike showed that a running
Spotify client publishes the real title and artwork to the OS, overriding us. On a
phone the Spotify app is far more likely to be installed and resident than on a
laptop, so this is the leak to watch. Force-quit it, do not merely background it.
