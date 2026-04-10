import type { ReactNode } from "react";

type WorkspaceTab = "Dashboard" | "Interview" | "Canon" | "Files" | "Site" | "Assets" | "Ops";

type NavItem = {
  tab: WorkspaceTab;
  glyph: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { tab: "Dashboard", glyph: "◈", label: "Dashboard" },
  { tab: "Interview", glyph: "◉", label: "Interview" },
  { tab: "Canon", glyph: "⊞", label: "Canon" },
  { tab: "Files", glyph: "⊟", label: "Files" },
  { tab: "Site", glyph: "⊙", label: "Site" },
  { tab: "Assets", glyph: "◧", label: "Assets" },
  { tab: "Ops", glyph: "⊡", label: "Ops" },
];

type Props = {
  activeTab: WorkspaceTab;
  projectTitle: string;
  onSelectTab: (tab: WorkspaceTab) => void;
  children: ReactNode;
};

export function AppShell({ activeTab, projectTitle, onSelectTab, children }: Props) {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__brandline">
          <span className="app-shell__glyph text-glow">◈</span>
          <span className="app-shell__brand text-display">G.E.C.K</span>
          <span className="app-shell__title">Media Package Generator</span>
        </div>
        <span className="badge badge--dim app-shell__project">{projectTitle}</span>
        <span className="app-shell__version">v2.0.0</span>
      </header>

      <div className="app-shell__content">
        <aside className="nav-rail app-shell__nav" aria-label="Primary navigation">
          <nav className="app-shell__nav-items">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.tab}
                type="button"
                className={`nav-item ${activeTab === item.tab ? "nav-item--active" : ""}`}
                onClick={() => onSelectTab(item.tab)}
              >
                <span className="app-shell__nav-glyph">{item.glyph}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="app-shell__footer-strip">
            <span>SYSTEM NOMINAL</span>
            <span className="app-shell__footer-status" aria-hidden="true">●</span>
            <span>PROVIDER: OPENROUTER</span>
          </div>
        </aside>

        <main className="app-shell__panel">{children}</main>
      </div>
    </div>
  );
}

export type { WorkspaceTab };
