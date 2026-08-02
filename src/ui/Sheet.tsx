import { type ReactNode, useEffect, useRef } from "react";

type Props = {
  /** aria-label for the dialog — what a screen reader announces on open. */
  label: string;
  onClose: () => void;
  children: ReactNode;
};

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet shell: scrim, dialog, focus trap, Escape-to-close, scroll lock.
 *
 * Slides up from the bottom rather than dropping from the header so the options land
 * in the thumb zone — reachable one-handed on a large phone, which a top-right
 * dropdown is not. See docs/08-mobile-ui.md.
 */
export function Sheet({ label, onClose, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Focus must return here on close, or a keyboard user is dumped at the top.
    const returnFocusTo = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    // Lock background scroll while the sheet is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Listening on the document rather than a wrapper element means Escape works
    // wherever focus happens to be.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      // Trap focus: without this, tabbing walks into the page behind the sheet.
      const focusable = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusTo?.focus();
    };
  }, []);

  return (
    <>
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} />
      <div
        className="sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="sheet__handle" />
        {children}
      </div>
    </>
  );
}
