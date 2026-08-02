import type { ReactNode } from "react";
import { Sheet } from "@/ui/Sheet";
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

export function MenuSheet({ info, items, onClose }: Props) {
  return (
    <Sheet label="Menu" onClose={onClose}>
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

      {/* Spotify's design guidelines expect attribution from apps using their
          content; the sheet is the least intrusive place that is always reachable. */}
      <p className="sheet__footnote">v{version} · Powered by Spotify</p>
    </Sheet>
  );
}
