import { describe, expect, it } from "vitest";
import { checkOrigin } from "@/auth/config";

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
