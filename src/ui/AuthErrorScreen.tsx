type Props = {
  message: string;
  code: string;
  onRetry: () => void;
};

/**
 * Auth failures get a named cause rather than a generic "login failed" — the two
 * that actually happen (not Premium, not on the dev-mode allowlist) are invisible
 * otherwise and waste a lot of time.
 */
export function AuthErrorScreen({ message, code, onRetry }: Props) {
  return (
    <section>
      <h1>Sign-in failed</h1>
      <p>{message}</p>
      <p>
        <small>Error code: {code}</small>
      </p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}
