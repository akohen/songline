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
    <section>
      <h1>Wrong address</h1>
      <p>
        This page is open at <code>{actualOrigin}</code>, but Spotify sign-in is
        configured for <code>{expectedOrigin}</code>. Spotify requires an exact match, so
        signing in from here would fail after the consent screen.
      </p>
      <p>
        <a href={target}>Open {target} instead</a>
      </p>
      <p>
        <small>
          Same server, different origin. If you meant to use this address, register it in
          the Spotify dashboard and set VITE_SPOTIFY_REDIRECT_URI to match.
        </small>
      </p>
    </section>
  );
}
