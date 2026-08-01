import { type ReactNode, useEffect, useRef } from "react";
import { version } from "../../package.json";

export type MenuItem = {
  label: string;
  onSelect: () => void;
};

type Props = {
  /** Muted, non-interactive lines at the top: signed-in name, current deck. */
  info: ReactNode;
  items: MenuItem[];
  onClose: () => void;
};

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet menu.
 *
 * Slides up from the bottom rather than dropping from the header so the options land
 * in the thumb zone — reachable one-handed on a large phone, which a top-right
 * dropdown is not. See docs/08-mobile-ui.md.
 */
export function MenuSheet({ info, items, onClose }: Props) {
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
      <button type="button" className="scrim" aria-label="Close menu" onClick={onClose} />
      <div
        className="sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="sheet__handle" />
        <div className="sheet__info">{info}</div>

        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="sheet__item"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}

        <button type="button" className="sheet__item" onClick={onClose}>
          Cancel
        </button>

        <p className="sheet__footnote">v{version}</p>
        {/* Spotify's design guidelines expect attribution from apps using their
            content; the sheet is the least intrusive place that is always reachable. */}
        <p className="sheet__footnote">Powered by Spotify</p>
      </div>
    </>
  );
}
