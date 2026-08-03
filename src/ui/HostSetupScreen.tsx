type Props = {
  onReady: () => void;
};

/**
 * Not decoration. The S0.1 spike proved that a running Spotify desktop app puts the
 * answer into macOS Control Centre, and that no code of ours can prevent it —
 * quitting Spotify elsewhere is the mitigation. See docs/tech/spotify-constraints.md.
 */
export function HostSetupScreen({ onReady }: Props) {
  return (
    <main className="screen">
      <h1 className="screen__title">Before you start</h1>
      <p className="screen__body">
        The game only works if nothing on screen gives the song away. Three of these are
        outside this app's control, so they are down to you:
      </p>
      <ol className="checklist">
        <li>
          <strong>Quit Spotify on every other device</strong> — phone, desktop app,
          tablet. A running Spotify app publishes the track title and cover art to your
          operating system, and will show the answer in Control Centre or on a lock
          screen. This app cannot stop that.
        </li>
        <li>
          <strong>Use a speaker without a screen.</strong> Bluetooth speakers with
          displays, car head units and TVs will show the track title.
        </li>
        <li>
          <strong>Don't cast or screen-mirror</strong> this browser tab.
        </li>
      </ol>
      <p className="screen__body">
        This browser tab is safe: it shows nothing identifying until you press Reveal, and
        it reports itself to the operating system as "Song Timeline".
      </p>
      <div className="spacer" />
      <div className="footer">
        <button type="button" className="btn btn--primary" onClick={onReady}>
          Ready — connect the player
        </button>
      </div>
    </main>
  );
}
