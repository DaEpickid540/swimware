/**
 * Client-side onboarding & role management — NO Cloud Functions required.
 *
 * Every privileged action here is a plain Firestore write that the security
 * rules validate (see firestore.rules). This keeps the whole app on the free
 * Spark plan. The security guarantees are enforced by the rules, not by this
 * code being "trusted":
 *   - Admin bootstrap works only for the hard-coded admin emails.
 *   - Swimmer creation is gated on redeeming a valid, unused invite token, done
 *     atomically with the token flip via a write batch.
 *   - Coaches are granted by an admin (pendingUsers) — never self-promoted.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  writeBatch,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type { Role } from "@/types/models";
import { LEGAL_VERSIONS } from "@/config/constants";

/** Mirror of the server allow-list (rules are the source of truth). Includes
 *  the Gmail dot-variant so either spelling of the address resolves to admin. */
export const ADMIN_EMAILS = [
  "sarvin.sukhe@gmail.com",
  "sarvinsukhe@gmail.com",
  "daepickid540@gmail.com",
];

export const isAdminEmail = (email?: string | null) =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());

/** Deterministic pendingUsers doc id — must match firestore.rules emailKey(). */
export const emailKey = (email: string) => email.toLowerCase().replace(/\./g, "_");

/** Append an audit-log entry about the current user's own action. */
export async function writeAudit(
  actorId: string,
  actorEmail: string | null,
  action: string,
  target?: string,
  details?: Record<string, unknown>
) {
  await addDoc(collection(db, "auditLogs"), {
    actorId,
    actorEmail,
    action,
    target: target ?? null,
    details: details ?? null,
    at: serverTimestamp(),
  });
}

/**
 * Resolve (and if needed provision) the signed-in user's role document.
 * Returns the user's role, or null when they have no role yet (→ /pending).
 *   - admin email           → ensure users doc role 'admin'
 *   - admin pre-registered   → consume pendingUsers, provision 'coach'
 *   - otherwise              → leave role-less (they can request coach access)
 */
export async function provisionOnSignIn(user: User): Promise<Role | null> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  // Admin bootstrap (allowed by rules only for allow-listed emails).
  if (isAdminEmail(user.email)) {
    if (!snap.exists()) {
      await setDoc(ref, {
        role: "admin",
        email: user.email,
        displayName: user.displayName ?? "Administrator",
        assignedTeams: [],
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (snap.data().role !== "admin") {
      await updateDoc(ref, { role: "admin", updatedAt: serverTimestamp() });
    }
    // Keep the authoritative "current consent version" doc (which rules
    // gate swimmer actions against) in sync with this build's constants.
    // Piggybacks on any admin sign-in, same pattern as the ADMIN_EMAILS
    // lists that are manually kept in sync across files in this app.
    await syncLegalVersions().catch(() => {});
    return "admin";
  }

  if (snap.exists()) return (snap.data().role as Role) ?? null;

  // No user doc yet — was this email pre-registered as a coach by an admin?
  const pendingRef = doc(db, "pendingUsers", emailKey(user.email ?? ""));
  const pending = await getDoc(pendingRef);
  if (pending.exists() && pending.data().role === "coach") {
    await setDoc(ref, {
      role: "coach",
      email: user.email,
      displayName: user.displayName ?? user.email ?? "Coach",
      assignedTeams: [],
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await deleteDoc(pendingRef).catch(() => {
      /* non-critical: the pending record is harmless if it lingers */
    });
    return "coach";
  }

  // Is this email a linked parent/guardian of one or more swimmers? The link
  // is written at swimmer registration (acceptInvite) under parentLinks/{key}.
  const linkRef = doc(db, "parentLinks", emailKey(user.email ?? ""));
  const link = await getDoc(linkRef).catch(() => null);
  if (link?.exists()) {
    const d = link.data();
    await setDoc(ref, {
      role: "parent",
      email: user.email,
      displayName: user.displayName ?? user.email ?? "Parent/Guardian",
      assignedTeams: Array.isArray(d.teamIds) ? d.teamIds : [],
      linkedSwimmers: Array.isArray(d.swimmerIds) ? d.swimmerIds : [],
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return "parent";
  }

  return null; // role-less → /pending (can request coach access)
}

/** A signed-in, role-less user asks an admin for coach access. */
export async function requestCoachAccess(user: User, note?: string) {
  await setDoc(doc(db, "accessRequests", user.uid), {
    email: user.email,
    displayName: user.displayName ?? "",
    note: note ?? "",
    status: "pending",
    requestedAt: serverTimestamp(),
  });
}

/** Generate a URL-safe 32-byte invite token id using the Web Crypto API. */
function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Coach/admin creates a single-use, expiring invite token (default 7 days).
 * Rules require the caller to coach the team and used=false.
 */
export async function createInviteToken(opts: {
  teamId: string;
  coachId: string;
  coachEmail?: string | null;
  intendedSwimmerName?: string;
  parentEmail?: string;
  ttlMs?: number;
}): Promise<{ token: string; expiresAt: number }> {
  const token = newToken();
  const expiresAt = Date.now() + (opts.ttlMs && opts.ttlMs > 0 ? opts.ttlMs : 7 * 24 * 60 * 60 * 1000);
  // Token creation + its audit entry land atomically — an invite can never
  // exist without a matching audit trail (no separate, fallible call).
  const batch = writeBatch(db);
  batch.set(doc(db, "inviteTokens", token), {
    token,
    teamId: opts.teamId,
    coachId: opts.coachId,
    intendedSwimmerName: opts.intendedSwimmerName ?? null,
    parentEmail: opts.parentEmail ?? null,
    expiresAt,
    used: false,
    usedBy: null,
    revoked: false,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "auditLogs")), {
    actorId: opts.coachId,
    actorEmail: opts.coachEmail ?? null,
    action: "invite.create",
    target: token,
    details: { teamId: opts.teamId },
    at: serverTimestamp(),
  });
  await batch.commit();
  return { token, expiresAt };
}

/** Admin-writable doc mirroring LEGAL_VERSIONS — the source rules gate
 *  swimmer actions against, so a version bump is enforced server-side too. */
export async function syncLegalVersions() {
  await setDoc(
    doc(db, "settings", "legalVersions"),
    {
      terms: LEGAL_VERSIONS.terms,
      privacy: LEGAL_VERSIONS.privacy,
      waiver: LEGAL_VERSIONS.waiver,
      parentConsent: LEGAL_VERSIONS.parentConsent,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export interface StoredConsents {
  terms?: { version: string; at: number };
  privacy?: { version: string; at: number };
  waiver?: { version: string; at: number };
  parent?: { version: string; at: number };
}

/** True if every stored consent version matches the app's current LEGAL_VERSIONS. */
export function consentsAreCurrent(consents: StoredConsents | undefined | null): boolean {
  if (!consents) return false;
  return (
    consents.terms?.version === LEGAL_VERSIONS.terms &&
    consents.privacy?.version === LEGAL_VERSIONS.privacy &&
    consents.waiver?.version === LEGAL_VERSIONS.waiver &&
    consents.parent?.version === LEGAL_VERSIONS.parentConsent
  );
}

/** Re-accept the current terms/privacy/waiver/parent-consent versions on your own doc. */
export async function reacceptConsents(user: User) {
  const now = Date.now();
  await updateDoc(doc(db, "users", user.uid), {
    consents: {
      terms: { version: LEGAL_VERSIONS.terms, at: now },
      privacy: { version: LEGAL_VERSIONS.privacy, at: now },
      waiver: { version: LEGAL_VERSIONS.waiver, at: now },
      parent: { version: LEGAL_VERSIONS.parentConsent, at: now },
    },
    updatedAt: serverTimestamp(),
  });
  await writeAudit(user.uid, user.email, "consents.reaccept", user.uid, {
    versions: LEGAL_VERSIONS,
  });
}

export interface SwimmerProfileInput {
  displayName: string;
  age?: number;
  phone?: string;
  linkedParentEmail?: string;
  emergencyContact?: string;
  medicalNotes?: string;
}
export interface ConsentInput {
  termsVersion: string;
  privacyVersion: string;
  waiverVersion: string;
  parentConsentVersion: string;
}

/**
 * Redeem an invite (the swimmer is already signed in with a fresh account).
 * Atomic write batch:
 *   1) create users/{uid} as swimmer on the invite's team (+ consents)
 *   2) flip inviteTokens/{token} used:false→true (single-use; rules enforce)
 *   3) add self to teams/{teamId}.swimmers
 *   4) append an audit entry
 * Rules reject the batch unless the token is valid, unused and unexpired.
 */
export async function acceptInvite(
  user: User,
  token: string,
  profile: SwimmerProfileInput,
  consents: ConsentInput
): Promise<{ teamId: string }> {
  const tokenRef = doc(db, "inviteTokens", token);
  const snap = await getDoc(tokenRef);
  if (!snap.exists()) throw new Error("Invalid invite link.");
  const t = snap.data();
  if (t.used) throw new Error("This invite has already been used.");
  if (t.revoked) throw new Error("This invite has been revoked.");
  if (typeof t.expiresAt === "number" && t.expiresAt < Date.now()) {
    throw new Error("This invite link has expired.");
  }
  const teamId = t.teamId as string;
  const now = Date.now();

  const batch = writeBatch(db);
  batch.set(doc(db, "users", user.uid), {
    role: "swimmer",
    email: user.email ?? null,
    displayName: profile.displayName,
    age: profile.age ?? null,
    phone: profile.phone ?? null,
    linkedParentEmail: profile.linkedParentEmail ?? t.parentEmail ?? null,
    emergencyContact: profile.emergencyContact ?? null,
    medicalNotes: profile.medicalNotes ?? null,
    assignedTeams: [teamId],
    invitedVia: token,
    invitedBy: t.coachId ?? null,
    active: true,
    consents: {
      terms: { version: consents.termsVersion, at: now },
      privacy: { version: consents.privacyVersion, at: now },
      waiver: { version: consents.waiverVersion, at: now },
      parent: { version: consents.parentConsentVersion, at: now },
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(tokenRef, { used: true, usedBy: user.uid, usedAt: serverTimestamp() });
  batch.update(doc(db, "teams", teamId), { swimmers: arrayUnion(user.uid) });

  // Record a parent/guardian link so the guardian can later sign in as a parent
  // and get a read-only view of this swimmer. Keyed by the guardian's email.
  const parentEmail = (profile.linkedParentEmail ?? t.parentEmail ?? "").toLowerCase();
  if (parentEmail) {
    batch.set(
      doc(db, "parentLinks", emailKey(parentEmail)),
      {
        parentEmail,
        swimmerIds: arrayUnion(user.uid),
        teamIds: arrayUnion(teamId),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  // Audit entry lands in the SAME atomic batch as the swimmer doc/token
  // flip/roster add — it can no longer silently fail after the fact.
  batch.set(doc(collection(db, "auditLogs")), {
    actorId: user.uid,
    actorEmail: user.email ?? null,
    action: "invite.accept",
    target: token,
    details: { teamId },
    at: serverTimestamp(),
  });

  await batch.commit();
  return { teamId };
}

/** Admin changes a user's role (rules require admin). Role update + audit
 *  entry are one atomic batch — the change can't happen without a matching,
 *  immutable trail (or vice versa). */
export async function setUserRole(adminUser: User, targetUid: string, role: Role) {
  const before = (await getDoc(doc(db, "users", targetUid))).data()?.role ?? null;
  const batch = writeBatch(db);
  batch.update(doc(db, "users", targetUid), { role, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, "auditLogs")), {
    actorId: adminUser.uid,
    actorEmail: adminUser.email ?? null,
    action: "user.role.change",
    target: targetUid,
    details: { from: before, to: role },
    at: serverTimestamp(),
  });
  await batch.commit();
}

/** Admin activates/deactivates a user (rules require admin). Note: this flags
 *  the account in Firestore — banned users are denied writes by the rules.
 *  Same atomic-batch treatment as setUserRole. */
export async function setUserActive(adminUser: User, targetUid: string, active: boolean) {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", targetUid), { active, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, "auditLogs")), {
    actorId: adminUser.uid,
    actorEmail: adminUser.email ?? null,
    action: active ? "user.activate" : "user.deactivate",
    target: targetUid,
    details: null,
    at: serverTimestamp(),
  });
  await batch.commit();
}

/** Admin pre-registers a coach by email so they're provisioned on first login. */
export async function preRegisterCoach(adminUser: User, email: string) {
  await setDoc(doc(db, "pendingUsers", emailKey(email)), {
    email: email.toLowerCase(),
    role: "coach",
    createdAt: serverTimestamp(),
  });
  await writeAudit(adminUser.uid, adminUser.email, "coach.preregister", email);
}

/** Admin assigns a coach to a team (updates both the team and the user doc). */
export async function assignCoachToTeam(coachUid: string, teamId: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, "teams", teamId), { coaches: arrayUnion(coachUid) });
  batch.update(doc(db, "users", coachUid), { assignedTeams: arrayUnion(teamId) });
  await batch.commit();
}

/** Create a team (staff). Optionally seed a season-end date + age group. */
export async function createTeam(opts: {
  name: string;
  ageGroup?: string;
  seasonEndDate?: number | null;
  creatorUid: string;
  creatorIsCoach: boolean;
}): Promise<string> {
  const ref = doc(collection(db, "teams"));
  await setDoc(ref, {
    name: opts.name,
    ageGroup: opts.ageGroup ?? "",
    // A coach creating a team is added to it so they can manage it immediately.
    coaches: opts.creatorIsCoach ? [opts.creatorUid] : [],
    swimmers: [],
    seasonEndDate: opts.seasonEndDate ?? null,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Keep the creating coach's own membership in sync.
  if (opts.creatorIsCoach) {
    await updateDoc(doc(db, "users", opts.creatorUid), {
      assignedTeams: arrayUnion(ref.id),
      updatedAt: serverTimestamp(),
    });
  }
  return ref.id;
}

/** Set/clear a team's season-end date (staff). */
export async function setTeamSeasonEnd(teamId: string, seasonEndDate: number | null) {
  await updateDoc(doc(db, "teams", teamId), { seasonEndDate, updatedAt: serverTimestamp() });
}

/**
 * Hard "end of season": unlink every member from the team. Removes the team
 * from each member's assignedTeams and clears the team's roster arrays. Done
 * client-side (no scheduled function needed); run by an admin or the team's
 * coach. Members regain nothing until re-invited next season.
 */
export async function endTeamSeason(actor: User, teamId: string) {
  const teamSnap = await getDoc(doc(db, "teams", teamId));
  if (!teamSnap.exists()) return;
  const data = teamSnap.data();
  const members: string[] = [
    ...(data.swimmers ?? []),
    ...(data.coaches ?? []),
  ];
  const batch = writeBatch(db);
  for (const uid of members) {
    batch.update(doc(db, "users", uid), {
      assignedTeams: arrayRemove(teamId),
      updatedAt: serverTimestamp(),
    });
  }
  batch.update(doc(db, "teams", teamId), {
    swimmers: [],
    coaches: [],
    archived: true,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await writeAudit(actor.uid, actor.email, "team.endSeason", teamId, { unlinked: members.length });
}
