# Song Timeline

A party game: a song plays, players guess its release year and build a chronological
timeline. Runs in the browser via the Spotify Web Playback SDK — see
[docs/product/game-design.md](docs/product/game-design.md) for the rules and
[docs/README.md](docs/README.md) for the full design documentation.

## You need your own Spotify app — the existing deployment won't work for you

The [Spotify Developer Policy](https://developer.spotify.com/policy) prohibits games,
so this app can only run in Spotify's **development mode**, which caps each app at
**5 manually allowlisted accounts**. There is no production/extended-quota mode to
apply for — the use case is explicitly against policy.

That means:

- Any existing deployment of this game (including one run by someone else) only
  works for the handful of accounts its owner has added to their own app's allowlist.
- To play, **you must create your own Spotify app** and add your own account (and
  anyone else you're hosting for, up to 5) to its allowlist.
- Everyone needs a **Spotify Premium** account. There is no free-tier fallback — see
  [docs/tech/spotify-constraints.md](docs/tech/spotify-constraints.md).

## Setup

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and create an app.
2. Note the **Client ID** shown on the app's settings page. You will not need the
   client secret for running the game locally.
3. Under **Redirect URIs**, add:

   ```
   http://127.0.0.1:5173/
   ```

   The trailing slash matters, and Spotify no longer accepts `localhost` — it must be
   `127.0.0.1`.
4. Under **User Management**, add your own Spotify account (the email associated
   with it) so it's allowed to sign in. Do the same for anyone else you want to be
   able to host a game.

### 2. Install and configure

```
pnpm install
cp .env.example .env.local
```

Edit `.env.local` and set:

```
VITE_SPOTIFY_CLIENT_ID=your-client-id-here
```

`VITE_SPOTIFY_REDIRECT_URI` can be left at its default
(`http://127.0.0.1:5173/`) unless you're deploying elsewhere.

### 3. Run it

```
pnpm dev
```

Open `http://127.0.0.1:5173/` and sign in with the Spotify account you allowlisted.
A Premium account is required for playback to start.

## Playing on a phone

The dev server isn't reachable over HTTPS, which the Web Playback SDK requires.
To play on a phone, deploy your own instance — see
[docs/tech/deployment.md](docs/tech/deployment.md).

## Further reading

[docs/README.md](docs/README.md) indexes the full design documentation, including
the game rules, architecture, deck format, and the constraints Spotify imposes on
this project.
