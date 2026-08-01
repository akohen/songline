/**
 * Token shape, expiry arithmetic and storage.
 *
 * The arithmetic is pure and tested; only the storage wrapper touches localStorage.
 */

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  issuedAt: number;
  /** Epoch ms. */
  expiresAt: number;
};

/** The subset of Spotify's token response we use. */
export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

/**
 * Spotify rotates refresh tokens, but a refresh response does not always carry a
 * new one. Dropping the previous token when the field is absent would log the user
 * out an hour into a game, so the old value is carried forward.
 */
export function tokenSetFromResponse(
  response: TokenResponse,
  now: number,
  previousRefreshToken?: string,
): TokenSet {
  const refreshToken = response.refresh_token ?? previousRefreshToken;
  if (!refreshToken) {
    throw new Error("Token response contained no refresh token and none was stored");
  }

  return {
    accessToken: response.access_token,
    refreshToken,
    issuedAt: now,
    expiresAt: now + response.expires_in * 1000,
  };
}

/** Treats a token as expired slightly early, so a request never races the clock. */
export function isExpired(tokens: TokenSet, now: number, skewMs = 30_000): boolean {
  return now >= tokens.expiresAt - skewMs;
}

/**
 * Milliseconds until the token should be refreshed — 80% through its lifetime,
 * never negative.
 *
 * Refreshing proactively rather than on failure is what keeps a game night from
 * being interrupted: acceptance criterion 7 in docs/06-iteration-1-plan.md.
 */
export function msUntilRefresh(tokens: TokenSet, now: number, fraction = 0.8): number {
  const lifetime = tokens.expiresAt - tokens.issuedAt;
  return Math.max(0, tokens.issuedAt + lifetime * fraction - now);
}

const STORAGE_KEY = "song-timeline:tokens";

function isTokenSet(value: unknown): value is TokenSet {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.accessToken === "string" &&
    typeof t.refreshToken === "string" &&
    typeof t.issuedAt === "number" &&
    typeof t.expiresAt === "number"
  );
}

export function parseStoredTokens(raw: string | null): TokenSet | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isTokenSet(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: TokenSet): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Private browsing or a full quota: the session still works, it just will not
    // survive a reload. Better than crashing on a write.
  }
}

export function loadTokens(): TokenSet | null {
  try {
    return parseStoredTokens(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See saveTokens.
  }
}
