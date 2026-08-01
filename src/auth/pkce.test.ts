import { describe, expect, it } from "vitest";
import {
  base64UrlEncode,
  deriveCodeChallenge,
  generateCodeVerifier,
  generateState,
  parseCallbackParams,
} from "@/auth/pkce";

describe("base64UrlEncode", () => {
  it("uses the URL-safe alphabet and strips padding", () => {
    // 0xFB 0xFF encodes to "+/8=" in standard base64.
    const encoded = base64UrlEncode(new Uint8Array([0xfb, 0xff]));
    expect(encoded).toBe("-_8");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("encodes empty input as an empty string", () => {
    expect(base64UrlEncode(new Uint8Array([]))).toBe("");
  });
});

describe("generateCodeVerifier", () => {
  it("defaults to a length inside Spotify's 43-128 range", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBe(64);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("uses only unreserved characters", () => {
    expect(generateCodeVerifier(128)).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCodeVerifier()));
    expect(seen.size).toBe(50);
  });
});

describe("deriveCodeChallenge", () => {
  // RFC 7636 Appendix B: the canonical S256 test vector.
  it("matches the RFC 7636 test vector", async () => {
    const challenge = await deriveCodeChallenge(
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    );
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("is deterministic", async () => {
    const verifier = generateCodeVerifier();
    expect(await deriveCodeChallenge(verifier)).toBe(await deriveCodeChallenge(verifier));
  });

  it("differs for different verifiers", async () => {
    const a = await deriveCodeChallenge(generateCodeVerifier());
    const b = await deriveCodeChallenge(generateCodeVerifier());
    expect(a).not.toBe(b);
  });
});

describe("generateState", () => {
  it("produces distinct URL-safe values", () => {
    const values = Array.from({ length: 50 }, () => generateState());
    expect(new Set(values).size).toBe(50);
    for (const value of values) expect(value).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});

describe("parseCallbackParams", () => {
  it("detects a normal page load", () => {
    expect(parseCallbackParams("")).toEqual({ kind: "none" });
    expect(parseCallbackParams("?foo=bar")).toEqual({ kind: "none" });
  });

  it("detects a successful callback", () => {
    expect(parseCallbackParams("?code=abc123&state=xyz")).toEqual({
      kind: "success",
      code: "abc123",
      state: "xyz",
    });
  });

  it("detects a declined authorisation", () => {
    expect(parseCallbackParams("?error=access_denied&state=xyz")).toEqual({
      kind: "error",
      error: "access_denied",
    });
  });

  it("rejects a code with no state rather than proceeding without CSRF cover", () => {
    expect(parseCallbackParams("?code=abc123")).toEqual({
      kind: "error",
      error: "malformed_callback",
    });
  });

  it("rejects a state with no code", () => {
    expect(parseCallbackParams("?state=xyz")).toEqual({
      kind: "error",
      error: "malformed_callback",
    });
  });

  it("prefers the error parameter when both are somehow present", () => {
    expect(parseCallbackParams("?error=server_error&code=abc&state=xyz")).toEqual({
      kind: "error",
      error: "server_error",
    });
  });
});
