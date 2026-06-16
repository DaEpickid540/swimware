/**
 * Central navigation definition, filtered by role. Used by the desktop sidebar,
 * tablet icon-rail, mobile drawer, and mobile bottom nav so they never drift.
 */
import type { ComponentType, SVGProps } from "react";
import type { Role } from "@/types/models";
import {
  IconDashboard,
  IconCalendar,
  IconNews,
  IconChat,
  IconSparkles,
  IconRoster,
  IconChart,
  IconSettings,
} from "@/components/icons";

export interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles: Role[];
  /** Show in the mobile bottom bar (max 5). */
  primary?: boolean;
}

const ALL: NavItem[] = [
  { to: "/admin", label: "Dashboard", Icon: IconDashboard, roles: ["admin"], primary: true },
  { to: "/coach", label: "Dashboard", Icon: IconDashboard, roles: ["coach"], primary: true },
  { to: "/swimmer", label: "Dashboard", Icon: IconDashboard, roles: ["swimmer"], primary: true },
  { to: "/events", label: "Events", Icon: IconCalendar, roles: ["admin", "coach", "swimmer"], primary: true },
  { to: "/chat", label: "Chat", Icon: IconChat, roles: ["admin", "coach", "swimmer"], primary: true },
  { to: "/news", label: "News", Icon: IconNews, roles: ["admin", "coach", "swimmer"], primary: true },
  { to: "/roster", label: "Roster", Icon: IconRoster, roles: ["admin", "coach"] },
  { to: "/swimmer/performance", label: "My Progress", Icon: IconChart, roles: ["swimmer"] },
  { to: "/ai", label: "AI Tools", Icon: IconSparkles, roles: ["admin", "coach", "swimmer"], primary: true },
  { to: "/settings", label: "Settings", Icon: IconSettings, roles: ["admin"] },
];

export function navForRole(role: Role | null): NavItem[] {
  if (!role) return [];
  return ALL.filter((i) => i.roles.includes(role));
}

/** Up to 5 items for the mobile bottom bar. */
export function bottomNavForRole(role: Role | null): NavItem[] {
  return navForRole(role)
    .filter((i) => i.primary)
    .slice(0, 5);
}
