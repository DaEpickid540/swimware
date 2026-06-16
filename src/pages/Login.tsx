/**
 * Portal-style landing + sign-in.
 *
 * Step 1: pick a portal — Coach, Swimmer, Parent, or Admin.
 * Step 2: sign in (Google or email/password).
 *
 * After sign-in:
 *   - ADMINS may enter ANY portal (the choice sets an admin "view-as"), which is
 *     how one admin can preview the swimmer/coach/parent experience.
 *   - Everyone else is routed to their real role's dashboard regardless of the
 *     portal button (the button is a hint; their real role always wins).
 * Swimmers still can't self-register — they join via an invite link.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME, ROLE_HOME } from "@/config/constants";
import { isAdminEmail } from "@/services/onboarding";
import { auth, db } from "@/services/firebase";
import { Card } from "@/components/ui";
import { IconRoster, IconChart, IconBell, IconSettings } from "@/components/icons";
import type { Role } from "@/types/models";

const PORTALS: { role: Role; label: string; blurb: string; Icon: typeof IconRoster }[] = [
  { role: "coach", label: "Coach", blurb: "Manage teams, events & rosters", Icon: IconRoster },
  { role: "swimmer", label: "Swimmer", blurb: "Your schedule, news & progress", Icon: IconChart },
  { role: "parent", label: "Parent / Guardian", blurb: "Follow your swimmer", Icon: IconBell },
  { role: "admin", label: "Admin", blurb: "Full program control", Icon: IconSettings },
];

export default function Login() {
  const { signIn, signInWithGoogle, signUpEmail, refresh, setViewAs } = useAuth();
  const navigate = useNavigate();

  const [portal, setPortal] = useState<Role | null>(null);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Default to invite-only (most secure) until settings load.
  const [inviteOnly, setInviteOnly] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "settings", "app"))
      .then((snap) => {
        if (snap.exists()) setInviteOnly(snap.data().requireInviteOnly !== false);
      })
      .catch(() => {
        /* keep the secure default */
      });
  }, []);

  // Resolve where to go after auth, honoring the chosen portal for admins.
  async function routeAfterAuth() {
    await refresh();
    const current = auth.currentUser;
    if (portal && current && isAdminEmail(current.email)) {
      // Admin previews the chosen portal (admins can view any interface).
      setViewAs(portal === "admin" ? null : portal);
      navigate(ROLE_HOME[portal], { replace: true });
    } else {
      setViewAs(null);
      navigate("/", { replace: true });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUpEmail(email, password);
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 1: portal picker ------------------------------------------------
  if (!portal) {
    return (
      <div className="auth-screen">
        <div className="portal-wrap">
          <h1 className="portal-title">🐟 {APP_NAME}</h1>
          <p className="portal-sub">Choose how you’re signing in</p>
          <div className="portal-grid" role="list">
            {PORTALS.map((p) => (
              <button
                key={p.role}
                role="listitem"
                className="portal-card"
                onClick={() => {
                  setPortal(p.role);
                  setError(null);
                }}
                aria-label={`${p.label} portal — ${p.blurb}`}
              >
                <p.Icon className="portal-card__icon" />
                <span className="portal-card__label">{p.label}</span>
                <span className="portal-card__blurb">{p.blurb}</span>
              </button>
            ))}
          </div>
          <p className="portal-note">
            Swimmers join through an invite link from their coach — there’s no public
            sign-up.
          </p>
        </div>
      </div>
    );
  }

  // ---- Step 2: sign in for the chosen portal --------------------------------
  const portalMeta = PORTALS.find((p) => p.role === portal)!;
  // Open self-registration is only offered for coaches when invite-only is OFF.
  // Swimmers always join via invite; parents are linked automatically; admins
  // are fixed. When invite-only is ON, there is no public sign-up at all.
  const canRegister = portal === "coach" && !inviteOnly;

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <button
          type="button"
          className="btn btn--ghost btn--sm portal-back"
          onClick={() => setPortal(null)}
        >
          ← All portals
        </button>
        <h1 className="auth-title">{portalMeta.label} sign-in</h1>
        <p className="auth-sub">{portalMeta.blurb}</p>

        <Card>
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="auth-divider" role="separator" aria-label="or">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn btn--block btn--google"
            onClick={google}
            disabled={busy}
            aria-label="Continue with Google"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
              <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
              <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
            </svg>
            Continue with Google
          </button>

          {canRegister ? (
            <p className="auth-switch">
              {mode === "signin" ? (
                <>
                  New {portal}?{" "}
                  <button className="link" onClick={() => setMode("register")}>
                    Create an account
                  </button>
                </>
              ) : (
                <button className="link" onClick={() => setMode("signin")}>
                  ← Back to sign in
                </button>
              )}
            </p>
          ) : (
            <p className="auth-note">
              {portal === "swimmer"
                ? "Swimmers join via an invite link from their coach — there’s no public sign-up."
                : portal === "parent"
                ? "Sign in with the email your coach has on file for your swimmer to get linked automatically."
                : portal === "coach"
                ? "New coaches need an admin invite/approval. Sign in if you already have access."
                : "Admin access is limited to authorized accounts."}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
