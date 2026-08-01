type Props = {
  onLogin: () => void;
};

export function LoginScreen({ onLogin }: Props) {
  return (
    <section>
      <h1>Song Timeline</h1>
      <p>Guess the year. Build the timeline.</p>
      <p>Spotify Premium is required — the Web Playback SDK will not start without it.</p>
      <button type="button" onClick={onLogin}>
        Sign in with Spotify
      </button>
    </section>
  );
}
