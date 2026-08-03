import { API_BASE } from "@/auth/config";
import { AuthError } from "@/auth/spotifyAuth";

/** The subset of `GET /v1/me` we use. */
export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  /** "premium" | "free" | "open". Requires the user-read-private scope. */
  product: string;
  /** ISO 3166-1 alpha-2, for market-correct track resolution. */
  country: string;
};

export type PremiumStatus = "premium" | "not-premium";

/**
 * The Web Playback SDK refuses to start for non-Premium accounts, and there is no
 * fallback — `preview_url` is deprecated and null for apps created after Nov 2024.
 * Checking at login turns that into one clear message instead of a player that
 * silently never plays.
 *
 * Known gap: Spotify excludes mobile-only Premium plans from the SDK, but those
 * accounts still report `product: "premium"` here. This check cannot catch them;
 * they will fail later, when the player initialises. See docs/tech/spotify-constraints.md.
 */
export function classifyPremium(profile: SpotifyProfile): PremiumStatus {
  return profile.product === "premium" ? "premium" : "not-premium";
}

export async function fetchProfile(accessToken: string): Promise<SpotifyProfile> {
  const response = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new AuthError("Session expired.", "unauthorized");
  }
  if (response.status === 403) {
    // Dev-mode apps are capped at 5 allowlisted users, and this is what a
    // non-allowlisted account gets. The generic message is useless; name the cause.
    throw new AuthError(
      "This Spotify account is not on the app's allowlist. Add it in the Spotify " +
        "developer dashboard under Settings > User Management.",
      "not_allowlisted",
    );
  }
  if (!response.ok) {
    throw new AuthError(`Could not load profile (${response.status})`, "profile_failed");
  }

  return (await response.json()) as SpotifyProfile;
}
