import { describe, expect, it } from "vitest";
import {
  isExpired,
  msUntilRefresh,
  parseStoredTokens,
  type TokenResponse,
  type TokenSet,
  tokenSetFromResponse,
} from "@/auth/tokens";

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

const response: TokenResponse = {
  access_token: "access-1",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "refresh-1",
};

const tokens = (overrides: Partial<TokenSet> = {}): TokenSet => ({
  accessToken: "access-1",
  refreshToken: "refresh-1",
  issuedAt: NOW,
  expiresAt: NOW + HOUR,
  ...overrides,
});

describe("tokenSetFromResponse", () => {
  it("converts expires_in into an absolute expiry", () => {
    expect(tokenSetFromResponse(response, NOW)).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      issuedAt: NOW,
      expiresAt: NOW + HOUR,
    });
  });

  // Spotify rotates refresh tokens but does not always send a new one. Dropping
  // it here would log the user out an hour into a game.
  it("keeps the previous refresh token when the response omits one", () => {
    const { refresh_token: _omitted, ...withoutRefresh } = response;
    const result = tokenSetFromResponse(withoutRefresh, NOW, "refresh-original");
    expect(result.refreshToken).toBe("refresh-original");
  });

  it("prefers a rotated refresh token over the previous one", () => {
    const rotated = { ...response, refresh_token: "refresh-2" };
    expect(tokenSetFromResponse(rotated, NOW, "refresh-1").refreshToken).toBe(
      "refresh-2",
    );
  });

  it("throws when no refresh token is available from either source", () => {
    const { refresh_token: _omitted, ...withoutRefresh } = response;
    expect(() => tokenSetFromResponse(withoutRefresh, NOW)).toThrow(/no refresh token/i);
  });
});

describe("isExpired", () => {
  it("is false well before expiry", () => {
    expect(isExpired(tokens(), NOW)).toBe(false);
  });

  it("is true after expiry", () => {
    expect(isExpired(tokens(), NOW + HOUR + 1)).toBe(true);
  });

  // The skew is the point: a token valid for another 5s will not survive a
  // request's round trip.
  it("is true inside the safety skew, before the nominal expiry", () => {
    expect(isExpired(tokens(), NOW + HOUR - 5_000)).toBe(true);
  });

  it("respects a custom skew", () => {
    expect(isExpired(tokens(), NOW + HOUR - 5_000, 0)).toBe(false);
  });
});

describe("msUntilRefresh", () => {
  it("schedules at 80% of the token's lifetime", () => {
    expect(msUntilRefresh(tokens(), NOW)).toBe(HOUR * 0.8);
  });

  it("accounts for time already elapsed", () => {
    expect(msUntilRefresh(tokens(), NOW + HOUR * 0.5)).toBe(HOUR * 0.3);
  });

  it("never returns a negative delay", () => {
    expect(msUntilRefresh(tokens(), NOW + HOUR * 2)).toBe(0);
  });
});

describe("parseStoredTokens", () => {
  it("round-trips a stored token set", () => {
    const stored = tokens();
    expect(parseStoredTokens(JSON.stringify(stored))).toEqual(stored);
  });

  it("returns null for absent, malformed or incomplete data", () => {
    expect(parseStoredTokens(null)).toBeNull();
    expect(parseStoredTokens("{not json")).toBeNull();
    expect(parseStoredTokens(JSON.stringify({ accessToken: "a" }))).toBeNull();
    expect(parseStoredTokens(JSON.stringify("a string"))).toBeNull();
  });

  it("rejects a token set with the wrong field types", () => {
    const wrong = { ...tokens(), expiresAt: "soon" };
    expect(parseStoredTokens(JSON.stringify(wrong))).toBeNull();
  });
});
