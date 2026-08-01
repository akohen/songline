/**
 * PKCE primitives. Pure and testable — no window, no storage, no network.
 */

const VERIFIER_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/** base64url per RFC 4648 §5: base64 with -/_ and no padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Spotify requires 43–128 characters. 64 sits comfortably inside that and leaves
 * no reason to think about the bounds again.
 */
export function generateCodeVerifier(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => VERIFIER_CHARS[b % VERIFIER_CHARS.length]).join("");
}

/** S256 challenge — the only method Spotify accepts for PKCE. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/** Opaque value echoed back by Spotify; guards the callback against CSRF. */
export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export type CallbackParams =
  | { kind: "none" }
  | { kind: "success"; code: string; state: string }
  | { kind: "error"; error: string };

/**
 * Classify the URL we were redirected back to. Pure: takes a query string rather
 * than reading `window.location`.
 */
export function parseCallbackParams(search: string): CallbackParams {
  const params = new URLSearchParams(search);

  const error = params.get("error");
  if (error) return { kind: "error", error };

  const code = params.get("code");
  const state = params.get("state");
  if (code && state) return { kind: "success", code, state };

  // A code without state (or vice versa) is malformed, not merely absent.
  if (code || state) return { kind: "error", error: "malformed_callback" };

  return { kind: "none" };
}
