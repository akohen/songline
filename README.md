# Song Timeline

A party game: a song plays, players guess its release year and build a chronological
timeline. Runs in the browser via the Spotify Web Playback SDK — see
[docs/product/game-design.md](docs/product/game-design.md) for the rules and
[docs/README.md](docs/README.md) for the full design documentation.

## You always need your own Spotify app

The [Spotify Developer Policy](https://developer.spotify.com/policy) prohibits games,
so this app can only run in Spotify's **development mode**, which caps each app at
**5 manually allowlisted accounts**. There is no production/extended-quota mode to
apply for — the use case is explicitly against policy.

That means every Spotify app used with this game — whether it's a deployment someone
else is hosting or one you run yourself — is capped at 5 accounts, chosen by whoever
owns that app. If someone invites you to play on a deployment they're already
running, see **Joining someone else's deployment** below — it's the fastest path and
needs no install. Otherwise, see **Running it yourself**.

Everyone needs a **Spotify Premium** account. There is no free-tier fallback — see
[docs/tech/spotify-constraints.md](docs/tech/spotify-constraints.md).

## Joining someone else's deployment

Because sign-in uses PKCE (no client secret involved), you can point someone else's
running deployment at your **own** Spotify app instead of asking them to add your
account to theirs — useful once their app's 5 slots are full, or if you'd rather not
share your Spotify account with them.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and create an app.
2. Note the **Client ID** shown on the app's settings page.
3. Under **Redirect URIs**, add the exact URL your host gave you for the deployment
   (byte for byte, including the trailing slash — Spotify allows no wildcards).
4. Under **User Management**, add your own Spotify account so it's allowed to sign
   in. This app's 5 slots are yours to manage — the host's allowlist is untouched.
5. Open the deployment's URL, tap **Use your own Spotify app** on the sign-in screen,
   and paste in your Client ID. Then sign in.

## Running it yourself

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

If you're joining someone else's deployment, its URL is already reachable over
HTTPS — just open it on the phone. If you're running your own copy, the dev server
isn't reachable over HTTPS, which the Web Playback SDK requires; deploy your own
instance instead — see [docs/tech/deployment.md](docs/tech/deployment.md).

## Further reading

[docs/README.md](docs/README.md) indexes the full design documentation, including
the game rules, architecture, deck format, and the constraints Spotify imposes on
this project.
