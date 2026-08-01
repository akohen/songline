/**
 * Find Spotify track IDs for deck curation.
 *
 *   pnpm search:tracks "Queen Bohemian Rhapsody" "ABBA Dancing Queen"
 *   pnpm search:tracks --market=GB "Oasis Wonderwall"
 *
 * Prints candidates with their ID, Spotify's release date, playability, and the album
 * they sit on.
 *
 * **The album column is the one that matters.** Spotify's date is shown only to make
 * remasters and compilations visible — it is never the year to put in the deck. Set
 * `year` from Wikipedia/Discogs/MusicBrainz, and use this output to pick an ID whose
 * *recording* fits that year: no live cut, remix, re-recording or mashup.
 *
 * See docs/04-deck-format.md.
 */
import {
  describeTrack,
  getAppToken,
  type SpotifyTrack,
  spotifyGet,
} from "./spotifyApp.ts";

const DEFAULT_MARKET = "FR";
const RESULTS_PER_QUERY = 5;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const market =
    args.find((a) => a.startsWith("--market="))?.split("=")[1] ?? DEFAULT_MARKET;
  const queries = args.filter((a) => !a.startsWith("--"));

  if (queries.length === 0) {
    console.error('Usage: pnpm search:tracks [--market=FR] "artist title" …');
    process.exit(1);
  }

  const token = await getAppToken();

  for (const query of queries) {
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "track");
    url.searchParams.set("market", market);
    url.searchParams.set("limit", String(RESULTS_PER_QUERY));

    const { status, body } = await spotifyGet(url, token);
    console.log(`\n### ${query}   (market ${market})`);

    if (status !== 200) {
      console.log(`  search failed (${status})`);
      continue;
    }

    const items = (body as { tracks?: { items: SpotifyTrack[] } }).tracks?.items ?? [];
    if (items.length === 0) {
      console.log("  no results");
      continue;
    }

    for (const track of items) {
      const playable = track.is_playable === false ? "UNPLAYABLE" : "ok        ";
      const spotifyYear = track.album.release_date.slice(0, 4);
      console.log(`  ${track.id}  ${spotifyYear}  ${playable}  ${describeTrack(track)}`);
    }
  }

  console.log(
    "\nPick the ID whose track and album names match the recording you want.\n" +
      "The year column is Spotify's release date — informational only, never the deck year.",
  );
}

await main();
