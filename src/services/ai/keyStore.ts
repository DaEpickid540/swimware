/**
 * User-supplied API key storage.
 *
 * SECURITY MODEL: keys are stored ONLY in the browser's localStorage, scoped to
 * the signed-in user, and are NEVER written to Firestore or sent to our own
 * servers. They are sent directly from the browser to the chosen AI provider.
 *
 * localStorage is readable by any script on this origin, so this is appropriate
 * for a personal API key the user pasted — but it is NOT a secret manager. For
 * a hardened deployment, proxy AI calls through a Cloud Function that reads keys
 * from Secret Manager and remove this module. That tradeoff is intentional and
 * documented in the README.
 */

import type { AiProvider } from "./types";

const PREFIX = "swimware.aikey.";

export function getApiKey(provider: AiProvider): string {
  return localStorage.getItem(PREFIX + provider) ?? "";
}

export function setApiKey(provider: AiProvider, key: string): void {
  if (key) localStorage.setItem(PREFIX + provider, key.trim());
  else localStorage.removeItem(PREFIX + provider);
}

export function hasApiKey(provider: AiProvider): boolean {
  return Boolean(getApiKey(provider));
}

export function clearAllKeys(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
