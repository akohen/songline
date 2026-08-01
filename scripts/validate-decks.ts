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
import {
  describeTrack,
  getAppToken,
  type SpotifyTrack,
  spotifyGet,
} from "./spotifyApp.ts";

const DECKS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src/decks");

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

    const { status, body } = await spotifyGet(url, token);

    // 404 is a real result — a bad ID or a track pulled from the catalogue — so it
    // is recorded as "not found" rather than aborting the whole run.
    if (status === 404 || status === 400) {
      results.set(id, null);
      continue;
    }
    if (status !== 200) {
      throw new Error(`Track lookup failed for ${id} (${status})`);
    }

    results.set(id, body as SpotifyTrack);
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

async function main(): Promise<void> {
  const token = await getAppToken();

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
          `  UNPLAYABLE  ${card.year}  ${card.title} — ${card.artist}  (${card.spotifyTrackId}: ${track ? describeTrack(track) : "NOT FOUND"})`,
        );
      } else {
        console.log(`  ok  ${card.year}  ${track ? describeTrack(track) : "NOT FOUND"}`);
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
