type Props = {
  displayName: string | null;
  onLogout: () => void;
};

export function NotPremiumScreen({ displayName, onLogout }: Props) {
  return (
    <section>
      <h1>Spotify Premium required</h1>
      <p>
        {displayName ? `${displayName}'s account` : "This account"} is not Premium. Song
        Timeline plays full tracks through the Spotify Web Playback SDK, which only works
        for Premium accounts.
      </p>
      <p>
        There is no free tier fallback: Spotify's 30-second preview clips were deprecated
        in November 2024 and are unavailable to this app.
      </p>
      <button type="button" onClick={onLogout}>
        Sign in with a different account
      </button>
    </section>
  );
}
