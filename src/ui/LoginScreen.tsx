type Props = {
  onLogin: () => void;
};

export function LoginScreen({ onLogin }: Props) {
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
        <button type="button" className="btn btn--primary" onClick={onLogin}>
          Sign in with Spotify
        </button>
      </div>
    </main>
  );
}
