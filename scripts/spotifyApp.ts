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
 * `GET` against the Web API, retrying on 429 up to `MAX_RATE_LIMIT_RETRIES` times.
 *
 * A single retry was not enough at deck scale (300 cards means 300 sequential
 * requests): a sustained rate limit outlasts one wait and the second 429 would abort
 * the whole validation run.
 */
export async function spotifyGet(
  url: URL,
  token: string,
): Promise<{ status: number; body: unknown }> {
  let response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  for (
    let attempt = 0;
    response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES;
    attempt++
  ) {
    const wait = Number(response.headers.get("retry-after") ?? "2");
    console.log(`  rate limited, waiting ${wait}s…`);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

export function describeTrack(track: SpotifyTrack): string {
  const artists = track.artists.map((a) => a.name).join(", ");
  return `${track.name} — ${artists} [${track.album.album_type}: ${track.album.name}]`;
}
