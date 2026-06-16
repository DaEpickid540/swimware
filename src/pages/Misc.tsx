/** Small standalone pages: pending-approval and 404. */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { requestCoachAccess } from "@/services/onboarding";
import { Card } from "@/components/ui";

export function Pending() {
  const { signOut, firebaseUser, refresh } = useAuth();
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function checkAgain() {
    setBusy(true);
    setErr(null);
    try {
      await refresh();
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function requestAccess() {
    if (!firebaseUser) return;
    setBusy(true);
    setErr(null);
    try {
      await requestCoachAccess(firebaseUser);
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <Card title="Account pending">
        <p>
          Hi {firebaseUser?.displayName ?? firebaseUser?.email ?? "there"} — your
          account doesn’t have a role yet. If you’re a swimmer, please use the
          invite link from your coach. If you’re a coach, request access below and
          an admin will approve you.
        </p>
        {sent ? (
          <p role="status" className="saved-pill">
            ✓ Request sent — you’ll get access once an admin approves.
          </p>
        ) : (
          <button className="btn btn--primary" onClick={requestAccess} disabled={busy}>
            {busy ? "Sending…" : "Request coach access"}
          </button>
        )}
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
        <p className="btn-row" style={{ marginTop: "1rem" }}>
          <button className="btn" onClick={checkAgain} disabled={busy}>
            Check again
          </button>
          <button className="btn btn--ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </p>
      </Card>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="auth-screen">
      <Card title="Page not found">
        <p>That page doesn’t exist.</p>
        <Link className="btn" to="/">
          Go home
        </Link>
      </Card>
    </div>
  );
}
