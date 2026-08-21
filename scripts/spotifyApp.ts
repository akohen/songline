/**
 * Shared Spotify access for the curation scripts.
 *
 * Uses the **Client Credentials** flow, not PKCE: these run on the curator's machine
 * and need no user context, so they can hold a client secret. That secret has no
 * VITE_ prefix and therefore never reaches the browser bundle.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv(): { clientId: string; clientSecret: string } {
  // .env.local is git-ignored and holds the secret; parsed directly to avoid a
  // dependency for six lines of work.
  const env = new Map<string, string>();
  try {
    for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match?.[1] && match[2] !== undefined) env.set(match[1], match[2].trim());
    }
  } catch {
    // Fall through to process.env.
  }

  const clientId =
    process.env.VITE_SPOTIFY_CLIENT_ID ?? env.get("VITE_SPOTIFY_CLIENT_ID");
  const clientSecret =
    process.env.SPOTIFY_CLIENT_SECRET ?? env.get("SPOTIFY_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    console.error(
      "Missing credentials. Set VITE_SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local",
    );
    process.exit(1);
  }
  return { clientId, clientSecret };
}

export async function getAppToken(): Promise<string> {
  const { clientId, clientSecret } = loadEnv();
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status})`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export type SpotifyTrack = {
  id: string;
  name: string;
  is_playable?: boolean;
  artists: { name: string }[];
  album: { name: string; album_type: string; release_date: string };
};

const MAX_RATE_LIMIT_RETRIES = 5;

/**
 * Minimum spacing between Web API requests, in ms (~8 req/s).
 *
 * The point is to stay *under* Spotify's rolling window rather than discovering it by
 * tripping a 429. Requests here are sequential, so a single module-level clock is
 * enough — each call waits until the slot after the previous one. At deck scale this
 * costs a few extra seconds and removes the rate-limit stall entirely.
 */
const MIN_REQUEST_INTERVAL_MS = 120;

/**
 * Longest `Retry-After` we will wait out, in seconds.
 *
 * A short 429 is worth sleeping through; a punitive one is not. Spotify has answered
 * with tens of thousands of seconds (~24h), which turned the run into an indefinite
 * hang. Past this we abort with a clear message instead.
 */
const MAX_BACKOFF_S = 30;

let nextRequestAt = 0;

/** One request, no sooner than `MIN_REQUEST_INTERVAL_MS` after the previous one. */
async function pacedFetch(url: URL, token: string): Promise<Response> {
  const wait = nextRequestAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

/**
 * `GET` against the Web API. Requests are paced to stay under the rate limit; a 429 is
 * still retried up to `MAX_RATE_LIMIT_RETRIES` times as a safety net.
 *
 * A single retry was not enough at deck scale (300 cards means 300 sequential
 * requests): a sustained rate limit outlasts one wait and the second 429 would abort
 * the whole validation run. But an oversized `Retry-After` is not waited out — it
 * throws, so a punitive limit fails fast rather than hanging for hours.
 */
export async function spotifyGet(
  url: URL,
  token: string,
): Promise<{ status: number; body: unknown }> {
  let response = await pacedFetch(url, token);

  for (
    let attempt = 0;
    response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES;
    attempt++
  ) {
    const wait = Number(response.headers.get("retry-after") ?? "2");
    if (wait > MAX_BACKOFF_S) {
      throw new Error(
        `Spotify rate-limited for ${wait}s (Retry-After over the ${MAX_BACKOFF_S}s cap). ` +
          "Wait a while and retry, or validate one deck at a time: pnpm validate:decks <deck-id>.",
      );
    }
    console.log(`  rate limited, waiting ${wait}s…`);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    response = await pacedFetch(url, token);
  }

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

export function describeTrack(track: SpotifyTrack): string {
  const artists = track.artists.map((a) => a.name).join(", ");
  return `${track.name} — ${artists} [${track.album.album_type}: ${track.album.name}]`;
}
