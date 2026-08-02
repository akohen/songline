# PWA installability

This is installability only — a home-screen icon and a standalone window. It is
**not** offline support. The app needs the network for every session: the Web
Playback SDK streams audio and OAuth requires reaching Spotify, so there is nothing
useful to do offline. Never add a service worker or any caching layer beyond what is
described here.

## Why no service worker

Firebase Hosting already guarantees fresh builds without one:
`/assets/**` (Vite's content-hashed build output) is served `immutable`, and
`/index.html` is served `no-cache` (see [07-deployment.md](07-deployment.md) and
`firebase.json`). A service worker would have nothing left to usefully cache — and
would be the one component that could ever cause a returning user to be served a
stale build. Skipping it entirely is a stronger guarantee than any caching strategy,
so that is the deliberate choice here.

## What exists

- `public/manifest.webmanifest` — name, icons, `display: standalone`, `theme_color`/
  `background_color` matching the existing `#0d0f12` used elsewhere.
- Icon set in `public/` (`pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`,
  `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`) —
  generated once from `public/favicon.svg` via `@vite-pwa/assets-generator`, which was
  installed temporarily for this and removed afterward (it's not needed at build
  time). If `favicon.svg` ever changes, reinstall it to regenerate:

  ```
  pnpm add -D @vite-pwa/assets-generator
  pnpm exec pwa-assets-generator --preset minimal public/favicon.svg
  pnpm remove @vite-pwa/assets-generator
  ```
- `index.html` links the manifest and icons in `<head>`.
- `firebase.json` adds a `no-cache` header rule for `/manifest.webmanifest`, since it
  is an unhashed static filename that would otherwise fall outside the existing
  `/assets/**` and `/index.html` rules.

## Verified vs not verified

Automated (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`, plus inspecting
`dist/` for the manifest, icons, and updated `index.html`) has been checked. The
following need a human with a real device and have **not** been verified:

- Actually installing the app (desktop Chrome's install icon, Android "Add to Home
  Screen", iOS Safari "Add to Home Screen") and confirming it opens in a standalone
  window with the correct icon and theme color.
- Spotify OAuth / `checkOrigin` (`src/auth/config.ts`) succeeding inside an installed
  standalone window, not just a browser tab. `checkOrigin` compares against
  `window.location.origin`, which is unaffected by display mode, but this is reasoning
  about the code, not an observation of it running installed.
- iOS home-screen icon rendering specifically — iOS ignores the manifest's icon list
  and only reads the `apple-touch-icon` link.
