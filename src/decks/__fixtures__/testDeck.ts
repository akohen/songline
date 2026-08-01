import type { Deck } from "@/decks/types";

/**
 * Test-only deck. Not the real deck, and never bundled into a build.
 *
 * The track IDs are deliberately fake and obviously so — nothing here is played,
 * and a plausible-looking ID would invite someone to assume it was validated.
 */
export const testDeck: Deck = {
  // Distinct from the bundled "test-deck" in src/decks, which is a real playable
  // deck. This one is never loaded by the app.
  id: "fixture-deck",
  name: "Engine Fixture Deck",
  description: "Fixture for engine tests",
  language: "en",
  market: "FR",
  cards: [
    { spotifyTrackId: "track-a", year: 1965, title: "Song A", artist: "Artist A" },
    { spotifyTrackId: "track-b", year: 1972, title: "Song B", artist: "Artist B" },
    { spotifyTrackId: "track-c", year: 1984, title: "Song C", artist: "Artist C" },
    { spotifyTrackId: "track-d", year: 1991, title: "Song D", artist: "Artist D" },
    {
      spotifyTrackId: "track-e",
      year: 2003,
      title: "Song E",
      artist: "Artist E",
      startOffsetMs: 30_000,
    },
    { spotifyTrackId: "track-f", year: 2016, title: "Song F", artist: "Artist F" },
  ],
};
