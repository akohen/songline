import { useState } from "react";
import {
  getRedirectUri,
  isValidClientId,
  loadCustomClientId,
  saveCustomClientId,
} from "@/auth/config";

type Props = {
  onLogin: () => void;
};

export function LoginScreen({ onLogin }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(() => loadCustomClientId() !== null);
  const [clientId, setClientId] = useState(() => loadCustomClientId() ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleBlur = () => {
    const trimmed = clientId.trim();
    if (!trimmed) {
      saveCustomClientId(null);
      setError(null);
      return;
    }
    if (isValidClientId(trimmed)) {
      saveCustomClientId(trimmed);
      setError(null);
    } else {
      setError(
        "Doesn't look like a Spotify Client ID — 32 letters and numbers. Not saved.",
      );
    }
  };

  return (
    <main className="screen screen--centred">
      <div className="spacer" />
      <h1 className="screen__title">Song Timeline</h1>
      <p className="screen__body">Guess the year. Build the timeline.</p>
      <div className="spacer" />
      <div className="footer">
        <p className="screen__body">
          Spotify Premium is required — the Web Playback SDK will not start without it.
        </p>

        <button
          type="button"
          className="btn btn--tertiary btn--inline"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          Use your own Spotify app
        </button>

        {advancedOpen && (
          <div className="field">
            <label className="field__label" htmlFor="spotify-client-id">
              Spotify Client ID
            </label>
            <input
              id="spotify-client-id"
              className="field__input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              onBlur={handleBlur}
              placeholder="Leave blank to use the default app"
            />
            <p className="round__meta">
              Create a free app at developer.spotify.com/dashboard, then add this exact
              Redirect URI to it: <code>{getRedirectUri()}</code>
            </p>
            {error && <p className="field__error">{error}</p>}
          </div>
        )}

        <button type="button" className="btn btn--primary" onClick={onLogin}>
          Sign in with Spotify
        </button>
      </div>
    </main>
  );
}
