/**
 * Thin typed wrappers around the callable Cloud Functions.
 */
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { Role } from "@/types/models";

export const callCreateInvite = httpsCallable<
  { teamId: string; intendedSwimmerName?: string; parentEmail?: string; ttlMs?: number },
  { token: string; expiresAt: number }
>(functions, "createInvite");

export const callAcceptInvite = httpsCallable<
  {
    token: string;
    profile: {
      displayName: string;
      age?: number;
      phone?: string;
      linkedParentEmail?: string;
      emergencyContact?: string;
      medicalNotes?: string;
    };
    consents: { termsVersion: string; privacyVersion: string; waiverVersion: string };
  },
  { ok: boolean; teamId: string }
>(functions, "acceptInvite");

export const callSetUserRole = httpsCallable<
  { targetUid: string; role: Role },
  { ok: boolean }
>(functions, "setUserRole");

export const callSetUserActive = httpsCallable<
  { targetUid: string; active: boolean },
  { ok: boolean }
>(functions, "setUserActive");

export const callRefreshClaims = httpsCallable<void, { ok: boolean }>(
  functions,
  "refreshClaims"
);
