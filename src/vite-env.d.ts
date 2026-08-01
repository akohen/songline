/// <reference types="vite/client" />
/// <reference types="spotify-web-playback-sdk" />

interface ImportMetaEnv {
  /**
   * Spotify application client ID. Public by design — the app uses PKCE and holds
   * no secret. SPOTIFY_CLIENT_SECRET is deliberately absent here: without a VITE_
   * prefix it never reaches the browser bundle.
   */
  readonly VITE_SPOTIFY_CLIENT_ID: string;
  /**
   * Must match the Spotify dashboard entry byte for byte. Optional; defaults to
   * http://127.0.0.1:5173/
   */
  readonly VITE_SPOTIFY_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
