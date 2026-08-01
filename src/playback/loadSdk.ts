const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

let loadPromise: Promise<void> | null = null;

/**
 * Load the Spotify Web Playback SDK script once per page.
 *
 * The SDK signals readiness by calling a global that must be defined *before* the
 * script runs, so the callback is installed first and the tag appended after.
 */
export function loadSpotifySdk(): Promise<void> {
  loadPromise ??= new Promise<void>((resolve, reject) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => resolve();

    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onerror = () =>
      reject(
        new Error(
          "Could not load the Spotify player script. A content blocker or privacy " +
            "extension is the usual cause.",
        ),
      );
    document.head.appendChild(script);
  });

  return loadPromise;
}
