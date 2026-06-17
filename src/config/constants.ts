/**
 * Client-side constants. NOTE: the authoritative admin list lives server-side
 * (functions/src/config.ts). These values are display/UX defaults only and
 * never grant privilege on their own — Firestore rules trust custom claims.
 */

export const APP_NAME = "Mason Rec Rays";

/** Official Rec Rays branding assets (bundled locally in /public/brand). */
export const REC_BRAND = {
  logo: "/brand/rec-rays-logo.png",
  banner: "/brand/rec-banner.png",
};

/** Coach-facing feature-request form (opens in a new tab). */
export const FEATURE_REQUEST_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScbrb1C4cmod_GdqzmmMi0VBDVqrdXQRCyTwmqqm6J8wy8HQA/viewform";

/** Project repo — shown in the end-of-onboarding "star us" ask. */
export const GITHUB_REPO_URL = "https://github.com/DaEpickid540/swimware";

/**
 * Reference link used by the AI tools and for UX inspiration. The app does NOT
 * scrape this directly — it is passed to a user-configured web-scraper provider
 * when a coach asks the AI to "review the team calendar".
 */
export const GOMOTION_CALENDAR_URL =
  "https://www.gomotionapp.com/team/trmwm/page/calendar#/views/month/1780286400000/1782792000000";

/** Official Mason Rec Rays team site (GoMotion, team code trmwm). */
export const TEAM_SITE_URL = "https://www.gomotionapp.com/team/trmwm/page/home";

/** Current versions of legal text; bumping forces re-acceptance (see admin). */
export const LEGAL_VERSIONS = {
  terms: "2026-06-16",
  privacy: "2026-06-16",
  waiver: "2026-06-16",
  parentConsent: "2026-06-16",
};

/**
 * Parent/guardian attestation shown during invite registration. The app is
 * designed for youth swimmers (minors); registration must be completed by a
 * parent or legal guardian. This supports COPPA (parental consent for under-13)
 * and Ohio youth-program expectations. (This is product copy, not legal advice
 * — have counsel review before production use.)
 */
export const PARENT_CONSENT_TEXT =
  "I am the parent or legal guardian of this swimmer (or am 18+ registering " +
  "myself). I consent to the collection of the information on this form for the " +
  "purpose of running the swim program, I understand that team communication is " +
  "group-based and monitored (no private adult–minor messaging), and I " +
  "understand I can request review or deletion of my swimmer's data at any time.";

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
  parent: "/parent",
};
