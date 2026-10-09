/**
 * Display-name rules — mirror validDisplayName()/nameOkForRole() in
 * firestore.rules so the user sees a friendly message instead of a raw
 * permission error. Rules are the real enforcement.
 */
export const DISPLAY_NAME_MAX = 60;

const MARKUP = /[<>{}`\\]/;
const AUTHORITY = /\b(coach|admin|administrator|staff|moderator|official)\b/i;

/** Returns an error message, or null when the name is acceptable. */
export function displayNameError(name: string, role?: string | null): string | null {
  const n = name.trim();
  if (!n) return "Please enter a name.";
  if (n.length > DISPLAY_NAME_MAX) return `Names can be at most ${DISPLAY_NAME_MAX} characters.`;
  if (MARKUP.test(n)) return "Names can't contain < > { } ` or \\.";
  if (role !== "admin" && role !== "coach" && AUTHORITY.test(n)) {
    return "Words like “Coach” or “Admin” are reserved for staff accounts.";
  }
  return null;
}
