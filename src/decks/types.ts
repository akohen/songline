/**
 * Deck and card types. See docs/tech/deck-format.md for the curation rules.
 *
 * The deck is the sole source of truth for release years. Spotify's
 * `album.release_date` reports reissue dates for remasters and compilations, so it
 * is never read at runtime.
 */

/** A Spotify base-62 track ID — not a URI, not a URL. */
export type TrackId = string;

export type Card = {
  /** Also the card's identity within a deck: unique, and stable across sessions. */
  spotifyTrackId: TrackId;
  /** Year of first commercial release of *this recording*. Verified, not from the API. */
  year: number;
  /** Display only, shown at reveal. Never used for matching. */
  title: string;
  artist: string;
  /** Playback start position; skips a spoiler-heavy or dead intro. Defaults to 0. */
  startOffsetMs?: number;
  /** Curator's note — above all, why `year` differs from Spotify's release date. */
  notes?: string;
};

export type Deck = {
  /** Lowercase kebab-case; equals the filename stem. */
  id: string;
  name: string;
  description: string;
  /** BCP 47-ish language tag of the deck's content, e.g. "en", "fr". */
  language: string;
  /** ISO 3166-1 alpha-2 market the deck was validated against. */
  market: string;
  cards: Card[];
};
