/**
 * Mobile bottom navigation (≤5 thumb-friendly targets). Hidden on tablet/desktop
 * via CSS. Each target is ≥44px and labelled for screen readers.
 */
import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { bottomNavForRole } from "./navItems";

export function BottomNav() {
  const { role } = useAuth();
  const items = bottomNavForRole(role);
  if (items.length === 0) return null;

  return (
    <nav className="bottomnav" role="navigation" aria-label="Primary mobile">
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/swimmer" || to === "/coach" || to === "/admin"}
          className={({ isActive }) => `bottomnav__item${isActive ? " is-active" : ""}`}
        >
          <Icon className="bottomnav__icon" />
          <span className="bottomnav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
