import { checkOrigin, getRedirectUri } from "@/auth/config";
import { useAuth } from "@/auth/useAuth";
import { AuthErrorScreen } from "@/ui/AuthErrorScreen";
import { GameSession } from "@/ui/GameSession";
import { LoginScreen } from "@/ui/LoginScreen";
import { NotPremiumScreen } from "@/ui/NotPremiumScreen";
import { WrongOriginScreen } from "@/ui/WrongOriginScreen";

/**
 * Auth gate. The game screens (host setup checklist, deck select, round) arrive
 * with playback — see docs/roadmap.md#iteration-1--blind-jukebox.
 */
export function App() {
  const { state, login, logout, getAccessToken } = useAuth();

  switch (state.status) {
    case "loading":
      return (
        <main className="screen screen--centred">
          <p className="screen__body">Loading…</p>
        </main>
      );

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

      // Sign-out now lives in the shell's menu, so it is passed down rather than
      // rendered here.
      return (
        <GameSession
          getAccessToken={getAccessToken}
          profileName={state.profile.display_name ?? state.profile.id}
          onSignOut={logout}
        />
      );
    }
  }
}
