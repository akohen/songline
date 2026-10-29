import { type ReactNode, useState } from "react";
import { type MenuItem, MenuSheet } from "@/ui/MenuSheet";

type Props = {
  profileName: string;
  /** Present only once a deck is selected. */
  deckName?: string | undefined;
  onChangeDeck?: (() => void) | undefined;
  /** Whether a timeline game is being broadcast to nearby phones. */
  letOthersJoin?: boolean;
  /** Present only while a timeline game is in progress. */
  onToggleLetOthersJoin?: (() => void) | undefined;
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
  letOthersJoin = false,
  onToggleLetOthersJoin,
  onSignOut,
  children,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const items: MenuItem[] = [
    ...(onChangeDeck ? [{ label: "New game", onSelect: onChangeDeck }] : []),
    ...(onToggleLetOthersJoin
      ? [
          {
            label: letOthersJoin ? "Stop letting others join" : "Let others join",
            onSelect: onToggleLetOthersJoin,
          },
        ]
      : []),
    { label: "Sign out", onSelect: onSignOut },
  ];

  return (
    <div className="app">
      <header className="header">
        <button
          type="button"
          className="header__bar"
          aria-label="Menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <span className="header__title">Song Timeline</span>
          <span className="header__menu" aria-hidden="true">
            ⋯
          </span>
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
