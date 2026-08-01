import { ACCOUNTS_BASE, getClientId, getRedirectUri, SCOPES } from "@/auth/config";
import { deriveCodeChallenge, generateCodeVerifier, generateState } from "@/auth/pkce";
import {
  clearTokens,
  saveTokens,
  type TokenResponse,
  type TokenSet,
  tokenSetFromResponse,
} from "@/auth/tokens";

/**
 * The PKCE verifier and state live in sessionStorage, not localStorage: both are
 * single-use values for one in-flight redirect, and sessionStorage disposes of
 * them when the tab closes.
 */
const VERIFIER_KEY = "song-timeline:pkce_verifier";
const STATE_KEY = "song-timeline:pkce_state";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Sends the browser to Spotify's consent page. Does not return. */
export async function beginLogin(): Promise<void> {
  const verifier = generateCodeVerifier();
  const state = generateState();
  const challenge = await deriveCodeChallenge(verifier);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: "code",
    redirect_uri: getRedirectUri(),
    state,
    scope: SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.assign(`${ACCOUNTS_BASE}/authorize?${params}`);
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload as { error?: string; error_description?: string } | null;
    throw new AuthError(
      detail?.error_description ?? `Token request failed (${response.status})`,
      detail?.error ?? "token_request_failed",
    );
  }

  return payload as TokenResponse;
}

/**
 * Exchange the authorization code for tokens.
 *
 * The stored state must match the one Spotify echoed back; a mismatch means the
 * callback did not originate from the request we made, so the code is discarded.
 */
export async function completeLogin(
  code: string,
  returnedState: string,
  now: number = Date.now(),
): Promise<TokenSet> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);

  if (!verifier || !expectedState) {
    throw new AuthError(
      "Login session expired. Please sign in again.",
      "missing_verifier",
    );
  }
  if (returnedState !== expectedState) {
    throw new AuthError("Login state mismatch. Please sign in again.", "state_mismatch");
  }

  const response = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      client_id: getClientId(),
      code_verifier: verifier,
    }),
  );

  const tokens = tokenSetFromResponse(response, now);
  saveTokens(tokens);
  return tokens;
}

export async function refreshTokens(
  current: TokenSet,
  now: number = Date.now(),
): Promise<TokenSet> {
  const response = await requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      client_id: getClientId(),
    }),
  );

  const tokens = tokenSetFromResponse(response, now, current.refreshToken);
  saveTokens(tokens);
  return tokens;
}

export function logout(): void {
  clearTokens();
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
}

/**
 * Strip the OAuth parameters from the address bar after handling them, so a reload
 * does not attempt to redeem a spent code.
 */
export function cleanUrl(): void {
  window.history.replaceState({}, "", window.location.pathname);
}
