import { useEffect } from "react";

/**
 * Keep the screen awake for the duration of the component's life.
 *
 * The phone locking mid-round while everyone argues about a year is exactly the kind
 * of small annoyance that spoils a party game.
 *
 * Degrades silently: the API needs a secure context and is not in every browser. A
 * failure here must never surface an error or interrupt play.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (released || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied, unsupported, or the document was not visible. Not worth reporting.
      }
    };

    // The lock is dropped automatically whenever the tab is backgrounded, so it has
    // to be taken again on return — otherwise it silently stops working after the
    // first time the host checks a message.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => {});
    };
  }, []);
}
