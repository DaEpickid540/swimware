/**
 * Login + account creation. NOTE: there is intentionally NO swimmer sign-up
 * here — swimmers join only via an invite link (/invite/:token). New coach
 * accounts have no role until an admin approves them (they land on /pending,
 * where they can request access).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME } from "@/config/constants";
import { Card } from "@/components/ui";

export default function Login() {
  const { signIn, signInWithGoogle, signUpEmail, refresh } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "coach">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUpEmail(email, password);
      await refresh();
      // The index route ("/") redirects to the correct dashboard by role.
      navigate("/", { replace: true });
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
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">🐟 {APP_NAME}</h1>
        <p className="auth-sub">Swim team hub for coaches, swimmers &amp; families.</p>

        <Card title={mode === "signin" ? "Sign in" : "Coach registration"}>
          <form onSubmit={submit} noValidate>
            {mode === "coach" && (
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
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
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create coach account"}
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

          <p className="auth-switch">
            {mode === "signin" ? (
              <>
                Are you a coach?{" "}
                <button className="link" onClick={() => setMode("coach")}>
                  Register here
                </button>
              </>
            ) : (
              <button className="link" onClick={() => setMode("signin")}>
                ← Back to sign in
              </button>
            )}
          </p>
          <p className="auth-note">
            Swimmers don’t sign up here — ask your coach for an invite link.
          </p>
        </Card>
      </div>
    </div>
  );
}
