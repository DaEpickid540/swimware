/**
 * Client-side constants. NOTE: the authoritative admin list lives server-side
 * (functions/src/config.ts). These values are display/UX defaults only and
 * never grant privilege on their own — Firestore rules trust custom claims.
 */

export const APP_NAME = "Mason Rec Rays";

/**
 * Reference link used by the AI tools and for UX inspiration. The app does NOT
 * scrape this directly — it is passed to a user-configured web-scraper provider
 * when a coach asks the AI to "review the team calendar".
 */
export const GOMOTION_CALENDAR_URL =
  "https://www.gomotionapp.com/team/trmwm/page/calendar#/views/month/1780286400000/1782792000000";

/** Current versions of legal text; bumping forces re-acceptance (see admin). */
export const LEGAL_VERSIONS = {
  terms: "2026-01-01",
  privacy: "2026-01-01",
  waiver: "2026-01-01",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  practice: "Practice",
  meet: "Meet",
  social: "Social",
  meeting: "Meeting",
};

export const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  coach: "/coach",
  swimmer: "/swimmer",
};
