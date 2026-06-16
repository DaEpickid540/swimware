/**
 * Desktop left sidebar (icons + labels). On tablet it collapses to an
 * icon-only rail via CSS. Also used as the contents of the mobile drawer.
 */
import { NavLink } from "react-router-dom";
import { APP_NAME } from "@/config/constants";
import { useAuth } from "@/context/AuthContext";
import { navForRole } from "./navItems";
import { IconLogout } from "@/components/icons";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { effectiveRole, profile, signOut } = useAuth();
  const items = navForRole(effectiveRole);

  return (
    <nav className="sidebar" role="navigation" aria-label="Primary">
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">🐟</span>
        <span className="sidebar__brandtext">{APP_NAME}</span>
      </div>

      <ul className="sidebar__list">
        {items.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/swimmer" || to === "/coach" || to === "/admin"}
              className={({ isActive }) => `sidebar__link${isActive ? " is-active" : ""}`}
              onClick={onNavigate}
            >
              <Icon className="sidebar__icon" />
              <span className="sidebar__label">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar__foot">
        <div className="sidebar__user" title={profile?.email ?? ""}>
          <div className="avatar" aria-hidden="true">
            {(profile?.displayName ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="sidebar__usermeta">
            <span className="sidebar__username">{profile?.displayName}</span>
            <span className={`badge badge--${effectiveRole}`}>{effectiveRole}</span>
          </div>
        </div>
        <button className="sidebar__link sidebar__signout" onClick={() => signOut()}>
          <IconLogout className="sidebar__icon" />
          <span className="sidebar__label">Sign out</span>
        </button>
      </div>
    </nav>
  );
}
