/**
 * Responsive app shell.
 *   Desktop (≥1024): persistent left sidebar + top bar + content.
 *   Tablet (768–1023): sidebar collapses to an icon rail (CSS).
 *   Mobile (≤767): top bar with hamburger → slide-out drawer, plus a bottom nav.
 * The drawer traps focus and closes on Escape / backdrop click / navigation.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./shell/Sidebar";
import { TopBar } from "./shell/TopBar";
import { BottomNav } from "./shell/BottomNav";
import { IconClose } from "./icons";

const TITLES: Record<string, string> = {
  "/admin": "Admin Dashboard",
  "/coach": "Coach Dashboard",
  "/swimmer": "Dashboard",
  "/swimmer/performance": "My Progress",
  "/events": "Events & Schedule",
  "/news": "News & Announcements",
  "/chat": "Team Chat",
  "/ai": "AI Tools",
  "/roster": "Roster",
  "/settings": "Settings",
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const title = TITLES[location.pathname] ?? "Mason Rec Rays";

  // Close the drawer whenever the route changes.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="shell">
      {/* Persistent sidebar (desktop/tablet) */}
      <aside className="shell__sidebar">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <div className={`drawer${drawerOpen ? " is-open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer__backdrop" onClick={() => setDrawerOpen(false)} />
        <div className="drawer__panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            className="iconbtn drawer__close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <IconClose />
          </button>
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>

      <div className="shell__main">
        <TopBar title={title} onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main-content" className="shell__content" role="main" tabIndex={-1}>
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
