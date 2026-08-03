/**
 * Spotify OAuth configuration. See docs/tech/spotify-constraints.md.
 *
 * Authorization Code with PKCE: a static SPA cannot hold a client secret, and PKCE
 * issues refresh tokens to public clients. No secret appears anywhere in this
 * directory — SPOTIFY_CLIENT_SECRET is read only by the deck validator script.
 */

export const ACCOUNTS_BASE = "https://accounts.spotify.com";
export const API_BASE = "https://api.spotify.com/v1";

/**
 * Only what the game needs.
 *
 * - `streaming` and the two user-read scopes are required by the Web Playback SDK.
 * - `user-read-private` also yields `country`, needed for market-correct track
 *   resolution, and `product`, which is how we detect Premium.
 * - The playback-state scopes cover transferring playback to our device and
 *   controlling it.
 *
 * No playlist or library scopes: we never read the user's music.
 */
export const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
] as const;

export function getClientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!id) {
    throw new Error(
      "VITE_SPOTIFY_CLIENT_ID is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  return id;
}

export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:5173/";

/**
 * Must match the dashboard registration byte for byte — Spotify allows no
 * wildcards, and a mismatch fails only *after* the user has logged in, with the
 * unhelpful "redirect_uri: Not matching configuration".
 *
 * Read from configuration rather than derived from `window.location.origin`:
 * deriving it means the value silently changes depending on whether the page was
 * opened via 127.0.0.1 or localhost, which produces exactly that error.
 *
 * A function, not a constant, so importing this module does not touch `window`
 * and break node-environment tests.
 */
export function getRedirectUri(): string {
  return import.meta.env.VITE_SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

export type OriginCheck =
  | { ok: true }
  | { ok: false; expectedOrigin: string; actualOrigin: string };

/**
 * Pure so it can be tested: does the address the page was opened at agree with the
 * configured redirect URI?
 *
 * Catches the common trap of browsing to localhost:5173 while the app is
 * registered under 127.0.0.1 — same server, different origin, and Spotify only
 * complains at the end of the flow.
 */
export function checkOrigin(actualOrigin: string, redirectUri: string): OriginCheck {
  const expectedOrigin = new URL(redirectUri).origin;
  return actualOrigin === expectedOrigin
    ? { ok: true }
    : { ok: false, expectedOrigin, actualOrigin };
}
