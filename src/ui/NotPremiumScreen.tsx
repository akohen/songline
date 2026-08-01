type Props = {
  displayName: string | null;
  onLogout: () => void;
};

export function NotPremiumScreen({ displayName, onLogout }: Props) {
  return (
    <main className="screen">
      <div className="spacer" />
      <h1 className="screen__title screen__title--danger">Spotify Premium required</h1>
      <p className="screen__body">
        {displayName ? `${displayName}'s account` : "This account"} is not Premium. Song
        Timeline plays full tracks through the Spotify Web Playback SDK, which only works
        for Premium accounts.
      </p>
      <p className="screen__body">
        There is no free tier fallback: Spotify's 30-second preview clips were deprecated
        in November 2024 and are unavailable to this app.
      </p>
      <div className="spacer" />
      <div className="footer">
        <button type="button" className="btn btn--primary" onClick={onLogout}>
          Sign in with a different account
        </button>
      </div>
    </main>
  );
}
