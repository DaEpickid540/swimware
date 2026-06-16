/**
 * Coach dashboard: today's events, quick links, and the invite-link generator.
 * Generating an invite calls the createInvite Cloud Function (server validates
 * the coach owns the team and mints a single-use, expiring token).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import { createInviteToken } from "@/services/onboarding";
import type { Team, SwimEvent } from "@/types/models";
import { Card, Spinner, EmptyState } from "@/components/ui";

export default function CoachDashboard() {
  const { firebaseUser, assignedTeams } = useAuth();

  const teamsQ = useMemo(
    () =>
      firebaseUser
        ? query(collection(db, "teams"), where("coaches", "array-contains", firebaseUser.uid))
        : null,
    [firebaseUser]
  );
  const { data: teams, loading } = useQueryData<Team>(teamsQ);

  const eventsQ = useMemo(
    () =>
      assignedTeams.length
        ? query(collection(db, "events"), where("teamId", "in", assignedTeams.slice(0, 10)))
        : null,
    [assignedTeams]
  );
  const { data: events } = useQueryData<SwimEvent>(eventsQ);

  const [selectedTeam, setSelectedTeam] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [swimmerName, setSwimmerName] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generateInvite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInviteUrl(null);
    setBusy(true);
    try {
      if (!firebaseUser) throw new Error("Not signed in.");
      const res = await createInviteToken({
        teamId: selectedTeam || teams[0]?.id,
        coachId: firebaseUser.uid,
        intendedSwimmerName: swimmerName || undefined,
        parentEmail: parentEmail || undefined,
      });
      const url = `${window.location.origin}/invite/${res.token}`;
      setInviteUrl(url);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not create invite.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  const todays = events.filter((ev) => {
    const t = typeof ev.startTime === "number" ? ev.startTime : 0;
    const d = new Date(t);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  return (
    <div className="page">
      <h1 className="page__title">Coach dashboard</h1>

      <div className="grid grid--2">
        <Card title="Today’s events">
          {todays.length === 0 ? (
            <EmptyState message="Nothing scheduled for today." />
          ) : (
            <ul className="list">
              {todays.map((ev) => (
                <li key={ev.id}>
                  <strong>{ev.title}</strong> — {ev.type}
                </li>
              ))}
            </ul>
          )}
          <p className="quick-links">
            <Link className="btn btn--sm" to="/roster">Manage roster</Link>{" "}
            <Link className="btn btn--sm" to="/events">All events</Link>{" "}
            <Link className="btn btn--sm" to="/chat">Team chat</Link>
          </p>
        </Card>

        <Card title="Invite a swimmer" accent>
          <p className="muted">
            Generates a single-use link that expires in 7 days. Only people with
            the link can register — and only onto the team you choose.
          </p>
          <form onSubmit={generateInvite}>
            <div className="field">
              <label htmlFor="inv-team">Team</label>
              <select
                id="inv-team"
                className="input"
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                required
              >
                <option value="">Select a team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="inv-name">Swimmer name (optional)</label>
              <input
                id="inv-name"
                className="input"
                value={swimmerName}
                onChange={(e) => setSwimmerName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="inv-parent">Parent/guardian email (optional)</label>
              <input
                id="inv-parent"
                type="email"
                className="input"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
              />
            </div>
            {err && <p className="form-error" role="alert">{err}</p>}
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Generating…" : "Generate invite link"}
            </button>
          </form>

          {inviteUrl && (
            <div className="invite-result" role="status">
              <label htmlFor="inv-url">Share this link:</label>
              <div className="copy-row">
                <input id="inv-url" className="input" readOnly value={inviteUrl} />
                <button
                  className="btn btn--sm"
                  onClick={() => navigator.clipboard?.writeText(inviteUrl)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
