/**
 * Account linking — let ONE account sign in with multiple methods (Google +
 * email/password), so families don't end up with duplicate accounts. Linking
 * Google and email/password is FREE.
 *
 * Best practice (also enable this in the Firebase Console, free):
 *   Authentication → Settings → "One account per email address" = ON.
 * That makes Firebase refuse to create a second account for an email that's
 * already registered with another provider.
 *
 * Phone linking is intentionally NOT included here by default: phone auth sends
 * billable SMS beyond a small free quota. Add it behind the admin cost-gated
 * toggle if you accept those costs.
 */

import {
  EmailAuthProvider,
  linkWithPopup,
  linkWithCredential,
  unlink as fbUnlink,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export function providerIds(user: User | null): string[] {
  return user?.providerData.map((p) => p.providerId) ?? [];
}

export function hasProvider(user: User | null, id: string): boolean {
  return providerIds(user).includes(id);
}

/** Link a Google identity to the currently signed-in account (free). */
export async function linkGoogle(): Promise<void> {
  if (!auth.currentUser) throw new Error("Sign in first.");
  await linkWithPopup(auth.currentUser, googleProvider);
}

/** Link an email/password credential to the current account (free). */
export async function linkEmailPassword(email: string, password: string): Promise<void> {
  if (!auth.currentUser) throw new Error("Sign in first.");
  const cred = EmailAuthProvider.credential(email, password);
  await linkWithCredential(auth.currentUser, cred);
}

/** Remove a linked sign-in method (cannot remove the last one). */
export async function unlinkProvider(providerId: string): Promise<void> {
  if (!auth.currentUser) throw new Error("Sign in first.");
  if (providerIds(auth.currentUser).length <= 1) {
    throw new Error("You can't remove your only sign-in method.");
  }
  await fbUnlink(auth.currentUser, providerId);
}

export const PROVIDER_LABELS: Record<string, string> = {
  "google.com": "Google",
  password: "Email & password",
  "phone": "Phone",
};
