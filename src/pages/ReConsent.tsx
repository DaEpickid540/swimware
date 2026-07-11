/**
 * Blocking re-consent gate. Shown instead of any protected page when a
 * swimmer's stored consents.*.version doesn't match the app's current
 * LEGAL_VERSIONS (see config/constants.ts) — e.g. an admin updated the
 * terms/privacy/waiver text. Firestore rules independently enforce the same
 * check on chat posting and RSVP creation, so this isn't just a client-side
 * nicety: even a user who bypasses this screen (devtools, stale tab) is
 * blocked server-side until they re-accept.
 */
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { reacceptConsents } from "@/services/onboarding";
import { LEGAL_VERSIONS, PARENT_CONSENT_TEXT, APP_NAME } from "@/config/constants";
import { friendlyMessage } from "@/utils/errors";
import { Card, Spinner } from "@/components/ui";

export function ReConsent() {
  const { firebaseUser, refresh } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [parentConsent, setParentConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !accepted || !parentConsent) return;
    setBusy(true);
    setError(null);
    try {
      await reacceptConsents(firebaseUser);
      await refresh();
    } catch (err) {
      setError(friendlyMessage(err, "Could not save your acceptance. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--wide">
        <h1 className="auth-title">Updated terms for {APP_NAME}</h1>
        <p className="auth-sub">
          Our terms, privacy policy, or waiver have been updated. Please review and
          accept the current versions to keep using your account.
        </p>
        <Card>
          <form onSubmit={submit} className="form-grid">
            <label className="checkbox field--full">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I have read and accept the current Terms of Use, Privacy Policy, and
              Liability Waiver (v{LEGAL_VERSIONS.terms}).
            </label>
            <label className="checkbox field--full">
              <input
                type="checkbox"
                checked={parentConsent}
                onChange={(e) => setParentConsent(e.target.checked)}
              />
              {PARENT_CONSENT_TEXT}
            </label>
            {error && (
              <p className="form-error field--full" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn btn--primary btn--block field--full"
              type="submit"
              disabled={!accepted || !parentConsent || busy}
            >
              {busy ? <Spinner label="Saving…" /> : "Accept and continue"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
