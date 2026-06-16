/**
 * Server-side configuration.
 *
 * Admin emails are kept OUT of client code on purpose. In production prefer a
 * deploy-time secret/param:
 *   firebase functions:config:set admin.emails="a@x.com,b@y.com"   (gen-1)
 * or environment params (gen-2) via `defineString`. We read from process.env
 * first (works with `.env` files + emulator and gen-2 params) and fall back to
 * the known bootstrap pair so the project works out of the box.
 */

const FALLBACK_ADMIN_EMAILS = [
  "sarvin.sukhe@gmail.com",
  "daepickid540@gmail.com",
];

export function adminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const merged = new Set([
    ...FALLBACK_ADMIN_EMAILS.map((e) => e.toLowerCase()),
    ...fromEnv,
  ]);
  return [...merged];
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** Default invite lifetime if a caller does not specify one (7 days). */
export const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
