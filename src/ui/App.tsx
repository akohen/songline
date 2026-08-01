import { checkOrigin, getRedirectUri } from "@/auth/config";
import { useAuth } from "@/auth/useAuth";
import { AuthErrorScreen } from "@/ui/AuthErrorScreen";
import { GameSession } from "@/ui/GameSession";
import { LoginScreen } from "@/ui/LoginScreen";
import { NotPremiumScreen } from "@/ui/NotPremiumScreen";
import { WrongOriginScreen } from "@/ui/WrongOriginScreen";

/**
 * Auth gate. The game screens (host setup checklist, deck select, round) arrive
 * with playback — see docs/06-iteration-1-plan.md.
 */
export function App() {
  const { state, login, logout, getAccessToken } = useAuth();

  switch (state.status) {
    case "loading":
      return <p>Loading…</p>;

    case "anonymous": {
      // Catch an origin mismatch before sending the user through consent, not after.
      const origin = checkOrigin(window.location.origin, getRedirectUri());
      if (!origin.ok) {
        return (
          <WrongOriginScreen
            expectedOrigin={origin.expectedOrigin}
            actualOrigin={origin.actualOrigin}
          />
        );
      }
      return <LoginScreen onLogin={login} />;
    }

    case "error":
      return (
        <AuthErrorScreen message={state.message} code={state.code} onRetry={logout} />
      );

    case "authenticated": {
      if (state.premium === "not-premium") {
        return (
          <NotPremiumScreen displayName={state.profile.display_name} onLogout={logout} />
        );
      }

      return (
        <>
          <p>
            Signed in as {state.profile.display_name ?? state.profile.id} · Premium ·
            market {state.profile.country} ·{" "}
            <button type="button" onClick={logout}>
              Sign out
            </button>
          </p>
          <GameSession getAccessToken={getAccessToken} />
        </>
      );
    }
  }
}
