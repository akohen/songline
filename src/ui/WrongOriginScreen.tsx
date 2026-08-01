type Props = {
  expectedOrigin: string;
  actualOrigin: string;
};

/**
 * Shown instead of the login button when the page's origin does not match the
 * configured redirect URI.
 *
 * Without this the mismatch only surfaces *after* Spotify's consent screen, as
 * "redirect_uri: Not matching configuration" — an error that names the symptom
 * and hides the cause.
 */
export function WrongOriginScreen({ expectedOrigin, actualOrigin }: Props) {
  const target = `${expectedOrigin}/`;
  return (
    <main className="screen">
      <div className="spacer" />
      <h1 className="screen__title screen__title--danger">Wrong address</h1>
      <p className="screen__body">
        This page is open at <code>{actualOrigin}</code>, but Spotify sign-in is
        configured for <code>{expectedOrigin}</code>. Spotify requires an exact match, so
        signing in from here would fail after the consent screen.
      </p>
      <p className="round__meta">
        Same server, different origin. If you meant to use this address, register it in
        the Spotify dashboard and set VITE_SPOTIFY_REDIRECT_URI to match.
      </p>
      <div className="spacer" />
      <div className="footer">
        <a className="btn btn--primary" href={target}>
          Open {target} instead
        </a>
      </div>
    </main>
  );
}
