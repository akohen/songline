import { useState } from "react";
import { checkOrigin, getRedirectUri } from "@/auth/config";
import { useAuth } from "@/auth/useAuth";
import {
  canUseMicrophone,
  closeMicrophone,
  type Microphone,
  openMicrophone,
} from "@/sync/ggwaveTransport";
import { AuthErrorScreen } from "@/ui/AuthErrorScreen";
import { GameSession } from "@/ui/GameSession";
import { LoginScreen } from "@/ui/LoginScreen";
import { NotPremiumScreen } from "@/ui/NotPremiumScreen";
import { WatchScreen } from "@/ui/WatchScreen";
import { WrongOriginScreen } from "@/ui/WrongOriginScreen";

/**
 * Auth gate. The game screens (host setup checklist, deck select, round) arrive
 * with playback — see docs/roadmap.md#iteration-1--blind-jukebox.
 */
export function App() {
  const { state, login, logout, getAccessToken } = useAuth();

  /**
   * Watching someone else's game: null when not, `mic: null` where the browser will not
   * give a microphone at all (plain HTTP).
   *
   * There is no router, so this is the route. The mic is opened and closed here, in the
   * click handlers, rather than by the watch screen: iOS starts audio only from a tap,
   * and an effect's cleanup — which StrictMode runs on every mount — must not be what
   * releases it.
   */
  const [watching, setWatching] = useState<{ mic: Microphone | null } | null>(null);

  const join = () => setWatching({ mic: canUseMicrophone() ? openMicrophone() : null });
  const rejoin = () => {
    if (watching?.mic) closeMicrophone(watching.mic);
    join();
  };
  const leave = () => {
    if (watching?.mic) closeMicrophone(watching.mic);
    setWatching(null);
  };

  switch (state.status) {
    case "loading":
      return (
        <main className="screen screen--centred">
          <p className="screen__body">Loading…</p>
        </main>
      );

    case "anonymous": {
      // Before the origin check: a viewer never signs in, so the redirect URI is moot.
      if (watching) {
        return <WatchScreen mic={watching.mic} onRetry={rejoin} onBack={leave} />;
      }

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
      return <LoginScreen onLogin={login} onJoin={join} />;
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
