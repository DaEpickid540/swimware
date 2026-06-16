/**
 * Swimmer registration via invite link (/invite/:token).
 * Flow:
 *   1) Read the token doc by id and validate (exists, not used, not expired).
 *   2) Collect required info + consents (terms/privacy/waiver acceptance).
 *   3) Create a Firebase Auth account (email/password).
 *   4) Call acceptInvite() — the ONLY way a swimmer account gets the swimmer
 *      role + roster membership. The function re-validates the token server-side
 *      and burns it.
 * There is no public swimmer sign-up anywhere else in the app.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/services/firebase";
import { callAcceptInvite } from "@/services/functions";
import { useAuth } from "@/context/AuthContext";
import { LEGAL_VERSIONS, APP_NAME } from "@/config/constants";
import { Card, Spinner } from "@/components/ui";
import type { InviteToken } from "@/types/models";

type State = "loading" | "valid" | "invalid" | "expired" | "used" | "submitting" | "done";

export default function InviteRegister() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [emergency, setEmergency] = useState("");
  const [medical, setMedical] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "inviteTokens", token));
      if (!snap.exists()) return setState("invalid");
      const data = { id: snap.id, ...snap.data() } as InviteToken;
      if (data.used) return setState("used");
      if (data.expiresAt && data.expiresAt < Date.now()) return setState("expired");
      setDisplayName(data.intendedSwimmerName ?? "");
      setParentEmail(data.parentEmail ?? "");
      setState("valid");
    })().catch(() => setState("invalid"));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) return setError("You must accept the terms, privacy policy, and waiver.");
    setError(null);
    setState("submitting");
    try {
      // Create the Auth account first (no privileges yet — rules deny all until
      // acceptInvite grants the swimmer claim).
      await createUserWithEmailAndPassword(auth, email, password);
      await callAcceptInvite({
        token,
        profile: {
          displayName,
          age: age ? Number(age) : undefined,
          linkedParentEmail: parentEmail || undefined,
          emergencyContact: emergency || undefined,
          medicalNotes: medical || undefined,
        },
        consents: {
          termsVersion: LEGAL_VERSIONS.terms,
          privacyVersion: LEGAL_VERSIONS.privacy,
          waiverVersion: LEGAL_VERSIONS.waiver,
        },
      });
      await refresh(); // picks up the new swimmer claim
      setState("done");
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Registration failed.");
      setState("valid");
    }
  }

  if (state === "loading") return <Spinner label="Checking your invite…" />;

  if (state === "invalid" || state === "expired" || state === "used") {
    const msg =
      state === "expired"
        ? "This invite link has expired. Ask your coach for a new one."
        : state === "used"
        ? "This invite link has already been used."
        : "This invite link is invalid.";
    return (
      <div className="auth-screen">
        <Card title="Invite problem">
          <p role="alert">{msg}</p>
        </Card>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="auth-screen">
        <Card title="Welcome aboard! 🎉">
          <p role="status">You’re registered. Taking you to your dashboard…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--wide">
        <h1 className="auth-title">Join {APP_NAME}</h1>
        <p className="auth-sub">You’ve been invited to a swim team. Complete your registration below.</p>

        <Card>
          <form onSubmit={submit} className="form-grid">
            <div className="field">
              <label htmlFor="r-name">Swimmer full name *</label>
              <input id="r-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="r-age">Age *</label>
              <input id="r-age" type="number" min={4} max={25} className="input" value={age} onChange={(e) => setAge(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="r-email">Login email *</label>
              <input id="r-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="r-pass">Create password *</label>
              <input id="r-pass" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="r-parent">Parent/guardian email *</label>
              <input id="r-parent" type="email" className="input" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="r-emergency">Emergency contact *</label>
              <input id="r-emergency" className="input" value={emergency} onChange={(e) => setEmergency(e.target.value)} placeholder="Name & phone" required />
            </div>
            <div className="field field--full">
              <label htmlFor="r-medical">Medical notes (non-sensitive only)</label>
              <input id="r-medical" className="input" value={medical} onChange={(e) => setMedical(e.target.value)} placeholder='e.g. "allergic to chlorine" — no diagnoses' />
            </div>

            <label className="checkbox field--full">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              I have read and accept the Terms of Use, Privacy Policy, and Liability Waiver
              (v{LEGAL_VERSIONS.terms}).
            </label>

            {error && <p className="form-error field--full" role="alert">{error}</p>}

            <button className="btn btn--primary btn--block field--full" type="submit" disabled={state === "submitting"}>
              {state === "submitting" ? "Creating account…" : "Complete registration"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
