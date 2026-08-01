import { useCallback, useEffect, useRef, useState } from "react";
import { parseCallbackParams } from "@/auth/pkce";
import {
  classifyPremium,
  fetchProfile,
  type PremiumStatus,
  type SpotifyProfile,
} from "@/auth/profile";
import {
  AuthError,
  beginLogin,
  cleanUrl,
  logout as clearSession,
  completeLogin,
  refreshTokens,
} from "@/auth/spotifyAuth";
import { isExpired, loadTokens, msUntilRefresh, type TokenSet } from "@/auth/tokens";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "error"; message: string; code: string }
  | {
      status: "authenticated";
      profile: SpotifyProfile;
      premium: PremiumStatus;
    };

/**
 * Boot runs once per page load, not once per mount.
 *
 * React StrictMode mounts effects twice in development. Without this guard the
 * second run would try to redeem an authorization code that the first already
 * spent, and every dev login would appear to fail.
 */
let bootPromise: Promise<TokenSet | null> | null = null;

async function boot(): Promise<TokenSet | null> {
  const callback = parseCallbackParams(window.location.search);

  if (callback.kind === "error") {
    cleanUrl();
    if (callback.error === "access_denied") {
      throw new AuthError("Spotify authorisation was declined.", "access_denied");
    }
    throw new AuthError(`Spotify returned an error: ${callback.error}`, callback.error);
  }

  if (callback.kind === "success") {
    const tokens = await completeLogin(callback.code, callback.state);
    cleanUrl();
    return tokens;
  }

  const stored = loadTokens();
  if (!stored) return null;

  // Resuming a session whose access token died while the tab was closed.
  return isExpired(stored, Date.now()) ? await refreshTokens(stored) : stored;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const tokensRef = useRef<TokenSet | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Always reads the current token, so callers never capture a stale one. */
  const getAccessToken = useCallback(() => tokensRef.current?.accessToken ?? null, []);

  const fail = useCallback((error: unknown) => {
    const authError =
      error instanceof AuthError
        ? error
        : new AuthError(
            error instanceof Error ? error.message : "Unexpected error",
            "unknown",
          );
    tokensRef.current = null;
    clearSession();
    setState({ status: "error", message: authError.message, code: authError.code });
  }, []);

  /** Refresh at 80% of the token's life, then reschedule. */
  const scheduleRefresh = useCallback(
    (tokens: TokenSet) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(
        () => {
          void (async () => {
            try {
              const next = await refreshTokens(tokens);
              tokensRef.current = next;
              scheduleRefresh(next);
            } catch (error) {
              fail(error);
            }
          })();
        },
        msUntilRefresh(tokens, Date.now()),
      );
    },
    [fail],
  );

  useEffect(() => {
    let cancelled = false;
    bootPromise ??= boot();

    void (async () => {
      try {
        const tokens = await bootPromise;
        if (cancelled) return;

        if (!tokens) {
          setState({ status: "anonymous" });
          return;
        }

        const profile = await fetchProfile(tokens.accessToken);
        if (cancelled) return;

        tokensRef.current = tokens;
        scheduleRefresh(tokens);
        setState({
          status: "authenticated",
          profile,
          premium: classifyPremium(profile),
        });
      } catch (error) {
        if (!cancelled) fail(error);
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [scheduleRefresh, fail]);

  const login = useCallback(() => {
    void beginLogin().catch(fail);
  }, [fail]);

  const logout = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    tokensRef.current = null;
    bootPromise = null;
    clearSession();
    setState({ status: "anonymous" });
  }, []);

  return { state, login, logout, getAccessToken };
}
