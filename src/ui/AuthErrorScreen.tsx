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
    <main className="screen">
      <div className="spacer" />
      <h1 className="screen__title screen__title--danger">Sign-in failed</h1>
      <p className="screen__body">{message}</p>
      <p className="round__meta">Error code: {code}</p>
      <div className="spacer" />
      <div className="footer">
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </main>
  );
}
