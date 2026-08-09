import { describe, expect, it } from "vitest";
import { checkOrigin, isValidClientId, resolveClientId } from "@/auth/config";

describe("checkOrigin", () => {
  it("accepts a matching origin", () => {
    expect(checkOrigin("http://127.0.0.1:5173", "http://127.0.0.1:5173/")).toEqual({
      ok: true,
    });
  });

  it("ignores the redirect URI's path", () => {
    expect(
      checkOrigin("http://127.0.0.1:5173", "http://127.0.0.1:5173/callback"),
    ).toEqual({ ok: true });
  });

  // The trap this exists for: same server, different origin, and Spotify only
  // complains after the consent screen.
  it("rejects localhost when 127.0.0.1 is configured", () => {
    expect(checkOrigin("http://localhost:5173", "http://127.0.0.1:5173/")).toEqual({
      ok: false,
      expectedOrigin: "http://127.0.0.1:5173",
      actualOrigin: "http://localhost:5173",
    });
  });

  it("rejects a different port", () => {
    const result = checkOrigin("http://127.0.0.1:4173", "http://127.0.0.1:5173/");
    expect(result.ok).toBe(false);
  });

  it("rejects a different scheme", () => {
    const result = checkOrigin("https://127.0.0.1:5173", "http://127.0.0.1:5173/");
    expect(result.ok).toBe(false);
  });
});

describe("resolveClientId", () => {
  it("prefers the override when present", () => {
    expect(resolveClientId("a".repeat(32), "envvalue")).toBe("a".repeat(32));
  });

  it("falls back to the env value when there is no override", () => {
    expect(resolveClientId(null, "envvalue")).toBe("envvalue");
  });

  it("throws when neither an override nor an env value is set", () => {
    expect(() => resolveClientId(null, undefined)).toThrow(
      "VITE_SPOTIFY_CLIENT_ID is not set",
    );
  });
});

describe("isValidClientId", () => {
  it("accepts 32 lowercase hex characters", () => {
    expect(isValidClientId("a".repeat(32))).toBe(true);
  });

  it("accepts uppercase hex characters", () => {
    expect(isValidClientId("A".repeat(32))).toBe(true);
  });

  it("rejects a value that is too short", () => {
    expect(isValidClientId("a".repeat(31))).toBe(false);
  });

  it("rejects a value that is too long", () => {
    expect(isValidClientId("a".repeat(33))).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidClientId("g".repeat(32))).toBe(false);
  });

  it("rejects whitespace", () => {
    expect(isValidClientId(`${"a".repeat(31)} `)).toBe(false);
  });
});
