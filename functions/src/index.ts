/**
 * Cloud Functions for Mason Rec Rays.
 *
 * Responsibilities that MUST be server-side (cannot be trusted to the client):
 *   - Assigning the `admin` role to the hard-coded admin emails.
 *   - Creating swimmer accounts ONLY in exchange for a valid invite token.
 *   - Promoting / demoting coaches and writing the audit trail.
 *   - Keeping the `assignedTeams` custom claim in sync with rosters.
 *   - Fan-out notifications / email when news is posted or RSVPs change.
 *
 * Roles & team membership are stored as CUSTOM CLAIMS so Firestore/Storage
 * rules can trust them. Clients must refresh their ID token after a claim
 * change (the web app calls getIdToken(true) — see refreshClaims()).
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as functionsV1 from "firebase-functions/v1";
import { logger } from "firebase-functions";
import { randomBytes } from "node:crypto";

import { isAdminEmail, DEFAULT_INVITE_TTL_MS } from "./config";
import { sendEmail } from "./email";

initializeApp();
const db = getFirestore();
const auth = getAuth();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Role = "admin" | "coach" | "swimmer";

function requireAuth<T>(req: CallableRequest<T>): { uid: string; email?: string; role?: Role } {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return {
    uid: req.auth.uid,
    email: req.auth.token.email,
    role: req.auth.token.role as Role | undefined,
  };
}

function requireStaff<T>(req: CallableRequest<T>) {
  const caller = requireAuth(req);
  if (caller.role !== "admin" && caller.role !== "coach") {
    throw new HttpsError("permission-denied", "Coaches or admins only.");
  }
  return caller;
}

/** Append an immutable audit-log entry (server-side only). */
async function writeAudit(entry: {
  actorId: string;
  actorEmail?: string;
  action: string;
  target?: string;
  details?: Record<string, unknown>;
}) {
  await db.collection("auditLogs").add({
    ...entry,
    at: FieldValue.serverTimestamp(),
  });
}

/** Recompute the `assignedTeams` custom claim from the user doc and re-mint. */
async function syncAssignedTeamsClaim(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.data() ?? {};
  const role = (data.role as Role) ?? "swimmer";
  const assignedTeams: string[] = Array.isArray(data.assignedTeams)
    ? data.assignedTeams
    : [];
  await auth.setCustomUserClaims(uid, { role, assignedTeams });
}

// ---------------------------------------------------------------------------
// 1) Admin bootstrap — on Auth account creation, if the email is a hard-coded
//    admin, grant the admin claim and create the user profile doc.
// ---------------------------------------------------------------------------
export const onAuthUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const email = user.email?.toLowerCase();
  if (isAdminEmail(email)) {
    await auth.setCustomUserClaims(user.uid, { role: "admin", assignedTeams: [] });
    await db.collection("users").doc(user.uid).set(
      {
        role: "admin",
        email,
        displayName: user.displayName ?? "Administrator",
        assignedTeams: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await writeAudit({
      actorId: user.uid,
      actorEmail: email,
      action: "admin.bootstrap",
      target: user.uid,
    });
    logger.info(`Granted admin role to ${email}`);
  }
  // Non-admins get no role here. Coaches self-create their profile doc (role
  // 'coach') on first sign-in; swimmers are created via acceptInvite().
});

// ---------------------------------------------------------------------------
// 2) Force a fresh set of claims onto the caller's token request. The client
//    still has to call getIdToken(true) to pick them up; this just guarantees
//    the claims reflect the latest roster state.
// ---------------------------------------------------------------------------
export const refreshClaims = onCall(async (req) => {
  const { uid } = requireAuth(req);
  await syncAssignedTeamsClaim(uid);
  return { ok: true };
});

// ---------------------------------------------------------------------------
// 3) createInvite — staff generate a single-use, time-limited invite token.
// ---------------------------------------------------------------------------
interface CreateInvitePayload {
  teamId: string;
  intendedSwimmerName?: string;
  parentEmail?: string;
  ttlMs?: number;
}

export const createInvite = onCall<CreateInvitePayload>(async (req) => {
  const caller = requireStaff(req);
  const { teamId, intendedSwimmerName, parentEmail, ttlMs } = req.data ?? {};
  if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

  // A coach may only invite to teams they are assigned to; admins to any.
  if (caller.role === "coach") {
    const team = await db.collection("teams").doc(teamId).get();
    const coaches: string[] = team.get("coaches") ?? [];
    if (!coaches.includes(caller.uid)) {
      throw new HttpsError("permission-denied", "Not your team.");
    }
  }

  // The document ID *is* the bearer token: 32 bytes of CSPRNG entropy.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + (ttlMs && ttlMs > 0 ? ttlMs : DEFAULT_INVITE_TTL_MS);

  await db.collection("inviteTokens").doc(token).set({
    token,
    teamId,
    coachId: caller.uid,
    intendedSwimmerName: intendedSwimmerName ?? null,
    parentEmail: parentEmail ?? null,
    expiresAt,
    used: false,
    usedBy: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  await writeAudit({
    actorId: caller.uid,
    actorEmail: caller.email,
    action: "invite.create",
    target: token,
    details: { teamId },
  });

  return { token, expiresAt };
});

// ---------------------------------------------------------------------------
// 4) acceptInvite — the swimmer (already signed in via a fresh Auth account)
//    redeems a token. We validate it, grant the swimmer role, create the
//    profile, add them to the roster, and mark the token used — atomically.
// ---------------------------------------------------------------------------
interface AcceptInvitePayload {
  token: string;
  profile: {
    displayName: string;
    age?: number;
    phone?: string;
    linkedParentEmail?: string;
    emergencyContact?: string;
    medicalNotes?: string;
  };
  consents: {
    termsVersion: string;
    privacyVersion: string;
    waiverVersion: string;
  };
}

export const acceptInvite = onCall<AcceptInvitePayload>(async (req) => {
  const caller = requireAuth(req); // must be signed in (the new account)
  const { token, profile, consents } = req.data ?? ({} as AcceptInvitePayload);

  if (!token) throw new HttpsError("invalid-argument", "Missing invite token.");
  if (!profile?.displayName) {
    throw new HttpsError("invalid-argument", "Swimmer name is required.");
  }
  if (!consents?.termsVersion) {
    throw new HttpsError("failed-precondition", "Consent acceptance is required.");
  }
  // Prevent an existing coach/admin from being downgraded by redeeming a token.
  if (caller.role === "admin" || caller.role === "coach") {
    throw new HttpsError("failed-precondition", "Staff accounts cannot redeem invites.");
  }

  const tokenRef = db.collection("inviteTokens").doc(token);

  const teamId = await db.runTransaction(async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) {
      throw new HttpsError("not-found", "Invalid invite link.");
    }
    const t = tokenSnap.data()!;
    if (t.used) throw new HttpsError("failed-precondition", "This invite has already been used.");
    if (typeof t.expiresAt === "number" && t.expiresAt < Date.now()) {
      throw new HttpsError("deadline-exceeded", "This invite link has expired.");
    }

    const teamRef = db.collection("teams").doc(t.teamId);
    const userRef = db.collection("users").doc(caller.uid);

    // Create swimmer profile.
    tx.set(
      userRef,
      {
        role: "swimmer",
        email: caller.email ?? null,
        displayName: profile.displayName,
        age: profile.age ?? null,
        phone: profile.phone ?? null,
        linkedParentEmail: profile.linkedParentEmail ?? t.parentEmail ?? null,
        emergencyContact: profile.emergencyContact ?? null,
        medicalNotes: profile.medicalNotes ?? null,
        assignedTeams: [t.teamId],
        consents: {
          terms: { version: consents.termsVersion, at: Date.now() },
          privacy: { version: consents.privacyVersion, at: Date.now() },
          waiver: { version: consents.waiverVersion, at: Date.now() },
        },
        invitedBy: t.coachId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Add to roster.
    tx.update(teamRef, { swimmers: FieldValue.arrayUnion(caller.uid) });

    // Burn the token.
    tx.update(tokenRef, { used: true, usedBy: caller.uid, usedAt: FieldValue.serverTimestamp() });

    return t.teamId as string;
  });

  // Grant role + team claim (outside the txn — Auth is not transactional).
  await auth.setCustomUserClaims(caller.uid, { role: "swimmer", assignedTeams: [teamId] });

  await writeAudit({
    actorId: caller.uid,
    actorEmail: caller.email,
    action: "invite.accept",
    target: token,
    details: { teamId },
  });

  // Notify the inviting coach (best-effort).
  const team = await db.collection("teams").doc(teamId).get();
  const coachId: string | undefined = team.get("coaches")?.[0];
  if (coachId) {
    const coach = await db.collection("users").doc(coachId).get();
    const coachEmail = coach.get("email");
    if (coachEmail) {
      await sendEmail({
        to: coachEmail,
        subject: `New swimmer joined ${team.get("name") ?? "your team"}`,
        text: `${profile.displayName} just completed registration via your invite.`,
      });
    }
  }

  return { ok: true, teamId };
});

// ---------------------------------------------------------------------------
// 5) setUserRole — admin promotes/demotes a coach (with audit + claim sync).
// ---------------------------------------------------------------------------
interface SetRolePayload {
  targetUid: string;
  role: Role;
}

export const setUserRole = onCall<SetRolePayload>(async (req) => {
  const caller = requireAuth(req);
  if (caller.role !== "admin") {
    throw new HttpsError("permission-denied", "Admins only.");
  }
  const { targetUid, role } = req.data ?? ({} as SetRolePayload);
  if (!targetUid || !["admin", "coach", "swimmer"].includes(role)) {
    throw new HttpsError("invalid-argument", "targetUid and a valid role are required.");
  }

  const userRef = db.collection("users").doc(targetUid);
  const before = (await userRef.get()).get("role");
  await userRef.set({ role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await syncAssignedTeamsClaim(targetUid); // re-mints role + teams claim

  await writeAudit({
    actorId: caller.uid,
    actorEmail: caller.email,
    action: "user.role.change",
    target: targetUid,
    details: { from: before, to: role },
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// 6) setUserActive — admin deactivates/reactivates an account.
// ---------------------------------------------------------------------------
export const setUserActive = onCall<{ targetUid: string; active: boolean }>(async (req) => {
  const caller = requireAuth(req);
  if (caller.role !== "admin") throw new HttpsError("permission-denied", "Admins only.");
  const { targetUid, active } = req.data;
  await auth.updateUser(targetUid, { disabled: !active });
  await db.collection("users").doc(targetUid).set(
    { active, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await writeAudit({
    actorId: caller.uid,
    actorEmail: caller.email,
    action: active ? "user.activate" : "user.deactivate",
    target: targetUid,
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// 7) Fan-out: when a news item is created, drop a notification doc for each
//    targeted user. (Kept simple; for large teams move to a paginated job.)
// ---------------------------------------------------------------------------
export const onNewsCreated = onDocumentCreated("news/{newsId}", async (event) => {
  const news = event.data?.data();
  if (!news) return;
  const visibleTo: string[] = news.visibleTo ?? ["all"];

  // Resolve recipients: union of team members for any team IDs in visibleTo,
  // plus everyone if 'all'. Capped query for safety.
  let usersQuery = db.collection("users").limit(500);
  const snap = await usersQuery.get();
  const batch = db.batch();
  snap.forEach((doc) => {
    const u = doc.data();
    const teams: string[] = u.assignedTeams ?? [];
    const targeted =
      visibleTo.includes("all") ||
      visibleTo.includes(u.role) ||
      teams.some((t) => visibleTo.includes(t));
    if (targeted) {
      const ref = db.collection("notifications").doc();
      batch.set(ref, {
        userId: doc.id,
        type: "news",
        title: news.title,
        body: news.priority === "high" ? `URGENT: ${news.title}` : news.title,
        link: `/news/${event.params.newsId}`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
  await batch.commit();
});

// ---------------------------------------------------------------------------
// 8) Email the coach when a swimmer RSVPs "going".
// ---------------------------------------------------------------------------
export const onSignupCreated = onDocumentCreated("signups/{signupId}", async (event) => {
  const signup = event.data?.data();
  if (!signup || signup.status !== "going") return;
  const ev = await db.collection("events").doc(signup.eventId).get();
  if (!ev.exists) return;
  const team = await db.collection("teams").doc(ev.get("teamId")).get();
  const coachId: string | undefined = team.get("coaches")?.[0];
  if (!coachId) return;
  const coach = await db.collection("users").doc(coachId).get();
  const coachEmail = coach.get("email");
  if (!coachEmail) return;
  await sendEmail({
    to: coachEmail,
    subject: `RSVP: ${signup.swimmerName ?? "A swimmer"} is going to ${ev.get("title")}`,
    text: `${signup.swimmerName ?? "A swimmer"} marked "going" for ${ev.get("title")}.`,
  });
});
