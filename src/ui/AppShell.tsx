import { type ReactNode, useState } from "react";
import { type MenuItem, MenuSheet } from "@/ui/MenuSheet";

type Props = {
  profileName: string;
  /** Present only once a deck is selected. */
  deckName?: string | undefined;
  onChangeDeck?: (() => void) | undefined;
  onSignOut: () => void;
  children: ReactNode;
};

/**
 * Header plus menu, wrapping every signed-in screen.
 *
 * The title is the static string "Song Timeline" and must never reflect deck or
 * track state — the same rule as the browser tab title in index.html.
 */
export function AppShell({
  profileName,
  deckName,
  onChangeDeck,
  onSignOut,
  children,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const items: MenuItem[] = [
    ...(onChangeDeck ? [{ label: "Change deck", onSelect: onChangeDeck }] : []),
    { label: "Sign out", onSelect: onSignOut },
  ];

  return (
    <div className="app">
      <header className="header">
        <span className="header__title">Song Timeline</span>
        <button
          type="button"
          className="header__menu"
          aria-label="Menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          ⋯
        </button>
      </header>

      {children}

      {menuOpen && (
        <MenuSheet
          info={
            <>
              <div>Signed in as {profileName}</div>
              {deckName && <div>{deckName}</div>}
            </>
          }
          items={items}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
