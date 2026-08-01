/**
 * Deck validator. Run with: pnpm validate:decks
 *
 * Checks that every card's Spotify ID resolves and is playable in the deck's market,
 * catching typos, removed tracks and market restrictions before game night rather
 * than during it.
 *
 * It deliberately does NOT compare `year` against Spotify's `album.release_date`:
 * those fields answer different questions, so a mismatch carries no information. It
 * prints the resolved track and album name instead, so a curator can eyeball that an
 * ID points at the recording they meant — a live cut or remix is the failure that
 * actually matters, and only a human can spot it.
 *
 * Authenticates with the Client Credentials flow: this runs on the curator's machine
 * and needs no user context, so it can use SPOTIFY_CLIENT_SECRET. That secret has no
 * VITE_ prefix and therefore never reaches the browser bundle.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Deck } from "../src/decks/types.ts";

const DECKS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src/decks");

type SpotifyTrack = {
  id: string;
  name: string;
  is_playable?: boolean;
  artists: { name: string }[];
  album: { name: string; release_date: string };
};

function loadEnv(): { clientId: string; clientSecret: string } {
  // .env.local is git-ignored and holds the secret; parsed directly to avoid a
  // dependency for six lines of work.
  const envPath = resolve(DECKS_DIR, "../../.env.local");
  const env = new Map<string, string>();
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
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

async function getAppToken(clientId: string, clientSecret: string): Promise<string> {
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

/**
 * Look tracks up one at a time.
 *
 * The bulk endpoint (`GET /v1/tracks?ids=`) returns 403 for this app regardless of
 * market or batch size, while `GET /v1/tracks/{id}` works — so batching is not
 * available to us. At deck scale that is a few dozen sequential requests, which is
 * well inside the rate limit and takes a couple of seconds.
 */
async function fetchTracks(
  ids: string[],
  market: string,
  token: string,
): Promise<Map<string, SpotifyTrack | null>> {
  const results = new Map<string, SpotifyTrack | null>();

  for (const id of ids) {
    const url = new URL(`https://api.spotify.com/v1/tracks/${id}`);
    url.searchParams.set("market", market);

    let response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (response.status === 429) {
      const wait = Number(response.headers.get("retry-after") ?? "2");
      console.log(`  rate limited, waiting ${wait}s…`);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    }

    // 404 is a real result — a bad ID or a track pulled from the catalogue — so it
    // is recorded as "not found" rather than aborting the whole run.
    if (response.status === 404 || response.status === 400) {
      results.set(id, null);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Track lookup failed for ${id} (${response.status})`);
    }

    results.set(id, (await response.json()) as SpotifyTrack);
  }

  return results;
}

function checkStructure(deck: Deck, filename: string): string[] {
  const errors: string[] = [];
  const stem = filename.replace(/\.json$/, "");

  if (deck.id !== stem) {
    errors.push(`deck id "${deck.id}" does not match filename stem "${stem}"`);
  }
  if (!deck.market) errors.push("deck has no market");
  if (deck.cards.length === 0) errors.push("deck has no cards");

  const seen = new Set<string>();
  const currentYear = new Date().getFullYear();

  for (const card of deck.cards) {
    const label = `${card.title} — ${card.artist}`;
    if (seen.has(card.spotifyTrackId)) {
      errors.push(`duplicate track ID ${card.spotifyTrackId} (${label})`);
    }
    seen.add(card.spotifyTrackId);

    if (!Number.isInteger(card.year) || card.year < 1900 || card.year > currentYear) {
      errors.push(`implausible year ${card.year} for ${label}`);
    }
    if (!/^[A-Za-z0-9]{22}$/.test(card.spotifyTrackId)) {
      errors.push(`malformed track ID "${card.spotifyTrackId}" (${label})`);
    }
    if (!card.title || !card.artist) errors.push(`missing title or artist: ${label}`);
  }

  return errors;
}

function describe(track: SpotifyTrack | null): string {
  if (!track) return "NOT FOUND";
  const artists = track.artists.map((a) => a.name).join(", ");
  return `${track.name} — ${artists} [${track.album.name}]`;
}

async function main(): Promise<void> {
  const { clientId, clientSecret } = loadEnv();
  const token = await getAppToken(clientId, clientSecret);

  const files = readdirSync(DECKS_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("No deck files found in src/decks");
    process.exit(1);
  }

  let failed = false;

  for (const file of files) {
    const deck = JSON.parse(readFileSync(join(DECKS_DIR, file), "utf8")) as Deck;
    console.log(`\n=== ${file} — ${deck.cards.length} cards, market ${deck.market} ===`);

    const structural = checkStructure(deck, file);
    for (const error of structural) console.log(`  STRUCTURE: ${error}`);
    if (structural.length > 0) failed = true;

    const tracks = await fetchTracks(
      deck.cards.map((c) => c.spotifyTrackId),
      deck.market,
      token,
    );

    const years = deck.cards.map((c) => c.year).sort((a, b) => a - b);
    let unplayable = 0;

    for (const card of deck.cards) {
      const track = tracks.get(card.spotifyTrackId) ?? null;
      const playable = track !== null && track.is_playable !== false;

      if (!playable) {
        unplayable += 1;
        failed = true;
        console.log(
          `  UNPLAYABLE  ${card.year}  ${card.title} — ${card.artist}  (${card.spotifyTrackId}: ${describe(track)})`,
        );
      } else {
        console.log(`  ok  ${card.year}  ${describe(track)}`);
      }
    }

    console.log(
      `  --- ${deck.cards.length - unplayable}/${deck.cards.length} playable · years ${years[0]}–${years[years.length - 1]} ---`,
    );
  }

  if (failed) {
    console.log("\nValidation FAILED");
    process.exit(1);
  }
  console.log("\nValidation passed");
}

await main();
