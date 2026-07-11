/**
 * Turns a caught error into a message safe to show a user.
 *
 * Firebase Auth/Firestore error messages (e.g. "Missing or insufficient
 * permissions.", raw Firestore document paths in some SDK exceptions) can hint
 * at rule/schema structure to someone probing the app, and are rarely useful
 * to an end user anyway. Known error codes get a short, generic message; the
 * full error — message, stack, code — is always logged to the console in dev
 * so local debugging isn't hurt.
 */

const KNOWN_CODES: Record<string, string> = {
  "auth/wrong-password": "Incorrect email or password.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/email-already-in-use": "An account with that email already exists.",
  "auth/weak-password": "Please choose a stronger password.",
  "auth/invalid-email": "That doesn't look like a valid email address.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/network-request-failed": "Network error — check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/requires-recent-login": "Please sign in again to continue.",
  "permission-denied": "You don't have permission to do that.",
  "not-found": "That item couldn't be found.",
  "unauthenticated": "Please sign in and try again.",
  "resource-exhausted": "Too many requests. Please try again shortly.",
};

function codeOf(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}

/** A message safe to render in the UI for a caught error. */
export function friendlyMessage(err: unknown, fallback: string): string {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  const code = codeOf(err);
  if (code && KNOWN_CODES[code]) return KNOWN_CODES[code];
  return fallback;
}
