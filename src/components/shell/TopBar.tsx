/**
 * Top bar: mobile menu button (opens drawer), current page title, theme toggle,
 * and the notification bell. Sticky, respects the iOS safe-area inset.
 */
import { useTheme } from "@/context/ThemeContext";
import { NotificationBell } from "./NotificationBell";
import { IconMenu } from "@/components/icons";

const THEME_LABEL: Record<string, string> = {
  light: "☀️",
  dark: "🌙",
  "high-contrast": "◐",
};

export function TopBar({ title, onOpenMenu }: { title: string; onOpenMenu: () => void }) {
  const { theme, cycleTheme } = useTheme();
  return (
    <header className="topbar" role="banner">
      <button
        className="iconbtn topbar__menu"
        onClick={onOpenMenu}
        aria-label="Open navigation menu"
      >
        <IconMenu />
      </button>

      <h1 className="topbar__title">{title}</h1>

      <div className="topbar__actions">
        <button
          className="iconbtn"
          onClick={cycleTheme}
          aria-label={`Theme: ${theme}. Activate to switch.`}
          title={`Theme: ${theme}`}
        >
          <span aria-hidden="true">{THEME_LABEL[theme]}</span>
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}
