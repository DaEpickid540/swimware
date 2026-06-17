/**
 * Admin dashboard + management panel: high-level stats, user list with
 * role promote/demote + deactivate (via callable functions), and recent audit
 * activity. Demonstrates the admin-only management flows end to end.
 */
import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useQueryData } from "@/hooks/useCollection";
import {
  setUserRole,
  setUserActive,
  preRegisterCoach,
  createTeam,
  setTeamSeasonEnd,
  endTeamSeason,
  assignCoachToTeam,
} from "@/services/onboarding";
import { useAuth } from "@/context/AuthContext";
import type { AppUser, Team, AuditLog, Role } from "@/types/models";
import { Card, StatTile, Spinner, Badge, EmptyState } from "@/components/ui";

interface AccessRequest {
  id: string;
  email: string;
  displayName?: string;
  note?: string;
  status: string;
}

export default function AdminDashboard() {
  const usersQ = useMemo(() => query(collection(db, "users"), limit(200)), []);
  const teamsQ = useMemo(() => collection(db, "teams"), []);
  const auditQ = useMemo(
    () => query(collection(db, "auditLogs"), orderBy("at", "desc"), limit(15)),
    []
  );

  const reqQ = useMemo(
    () => query(collection(db, "accessRequests"), where("status", "==", "pending")),
    []
  );

  const { data: users, loading } = useQueryData<AppUser>(usersQ);
  const { data: teams } = useQueryData<Team>(teamsQ as never);
  const { data: audit } = useQueryData<AuditLog>(auditQ);
  const { data: requests } = useQueryData<AccessRequest>(reqQ);
  const { firebaseUser } = useAuth();
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [coachEmail, setCoachEmail] = useState("");

  const counts = {
    swimmers: users.filter((u) => u.role === "swimmer").length,
    coaches: users.filter((u) => u.role === "coach").length,
    admins: users.filter((u) => u.role === "admin").length,
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  async function changeRole(uid: string, role: Role) {
    if (!firebaseUser) return;
    setBusyUid(uid);
    try {
      await setUserRole(firebaseUser, uid, role);
    } finally {
      setBusyUid(null);
    }
  }

  async function toggleActive(u: AppUser) {
    if (!firebaseUser) return;
    setBusyUid(u.id);
    try {
      await setUserActive(firebaseUser, u.id, !(u.active ?? true));
    } finally {
      setBusyUid(null);
    }
  }

  // Approving a request pre-registers the email as a coach; the requester is
  // provisioned on their next sign-in / "check again". Then drop the request.
  async function approveRequest(req: AccessRequest) {
    if (!firebaseUser) return;
    await preRegisterCoach(firebaseUser, req.email);
    await deleteDoc(doc(db, "accessRequests", req.id));
  }
  async function denyRequest(req: AccessRequest) {
    await deleteDoc(doc(db, "accessRequests", req.id));
  }
  async function addCoachByEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !coachEmail.trim()) return;
    await preRegisterCoach(firebaseUser, coachEmail.trim());
    setCoachEmail("");
  }

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">Admin dashboard</h1>

      <div className="stat-row">
        <StatTile label="Teams" value={teams.length} />
        <StatTile label="Swimmers" value={counts.swimmers} />
        <StatTile label="Coaches" value={counts.coaches} />
        <StatTile label="Admins" value={counts.admins} />
      </div>

      <Card title="Coach access">
        {requests.length > 0 && (
          <ul className="list" aria-label="Pending coach access requests">
            {requests.map((r) => (
              <li key={r.id} className="row-between">
                <span>
                  <strong>{r.displayName || r.email}</strong> <span className="muted">{r.email}</span>
                </span>
                <span className="row-actions">
                  <button className="btn btn--sm btn--primary" onClick={() => approveRequest(r)}>
                    Approve as coach
                  </button>
                  <button className="btn btn--sm" onClick={() => denyRequest(r)}>
                    Deny
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addCoachByEmail} className="copy-row" style={{ marginTop: requests.length ? "1rem" : 0 }}>
          <label htmlFor="add-coach" className="sr-only">
            Pre-register coach email
          </label>
          <input
            id="add-coach"
            type="email"
            className="input"
            placeholder="Add coach by email…"
            value={coachEmail}
            onChange={(e) => setCoachEmail(e.target.value)}
          />
          <button className="btn btn--sm" type="submit" disabled={!coachEmail.trim()}>
            Pre-register
          </button>
        </form>
        <p className="muted">
          The coach is provisioned automatically the next time they sign in with this email.
        </p>
      </Card>

      {firebaseUser && (
        <TeamsManager
          teams={teams}
          coaches={users.filter((u) => u.role === "coach")}
          actor={firebaseUser}
        />
      )}

      <Card
        title="User management"
        actions={
          <input
            className="input"
            placeholder="Search name or email…"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      >
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">All users with role and account controls</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}</td>
                  <td>{u.email}</td>
                  <td>
                    <Badge tone={u.role}>{u.role}</Badge>
                  </td>
                  <td>{u.active === false ? "Deactivated" : "Active"}</td>
                  <td className="row-actions">
                    {u.role !== "admin" && (
                      <>
                        {u.role === "swimmer" ? (
                          <button
                            className="btn btn--sm"
                            disabled={busyUid === u.id}
                            onClick={() => changeRole(u.id, "coach")}
                          >
                            Promote to coach
                          </button>
                        ) : (
                          <button
                            className="btn btn--sm"
                            disabled={busyUid === u.id}
                            onClick={() => changeRole(u.id, "swimmer")}
                          >
                            Demote to swimmer
                          </button>
                        )}
                        <button
                          className="btn btn--sm btn--danger"
                          disabled={busyUid === u.id}
                          onClick={() => toggleActive(u)}
                        >
                          {u.active === false ? "Reactivate" : "Deactivate"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recent activity (audit log)">
        {audit.length === 0 ? (
          <EmptyState message="No audit entries yet." />
        ) : (
          <ul className="activity">
            {audit.map((a) => (
              <li key={a.id}>
                <code>{a.action}</code> by {a.actorEmail ?? a.actorId}
                {a.target ? ` → ${a.target}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team management: create teams, set the season-end date (after which members
// are auto-unlinked), assign coaches, and run an explicit end-of-season cleanup.
function TeamsManager({
  teams,
  coaches,
  actor,
}: {
  teams: Team[];
  coaches: AppUser[];
  actor: User;
}) {
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [busy, setBusy] = useState(false);

  const toDateInput = (ms?: number | null) =>
    typeof ms === "number" ? new Date(ms).toISOString().slice(0, 10) : "";

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createTeam({ name: name.trim(), ageGroup, creatorUid: actor.uid, creatorIsCoach: false });
      setName("");
      setAgeGroup("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Teams & season">
      <form onSubmit={addTeam} className="field-row" style={{ marginBottom: "1rem" }}>
        <div className="field">
          <label htmlFor="tm-name">New team name</label>
          <input id="tm-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tm-age">Age group</label>
          <input id="tm-age" className="input" placeholder="9-10" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} />
        </div>
        <button className="btn btn--primary" type="submit" disabled={busy}>
          Create team
        </button>
      </form>

      {teams.length === 0 ? (
        <EmptyState message="No teams yet. Create one above." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Teams with season-end and coach controls</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Members</th>
                <th scope="col">Season ends</th>
                <th scope="col">Assign coach</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.name} {t.archived && <Badge tone="neutral">archived</Badge>}
                  </td>
                  <td>{(t.swimmers?.length ?? 0) + (t.coaches?.length ?? 0)}</td>
                  <td>
                    <input
                      type="date"
                      className="input"
                      defaultValue={toDateInput(t.seasonEndDate)}
                      onChange={(e) =>
                        setTeamSeasonEnd(
                          t.id,
                          e.target.value ? new Date(e.target.value + "T23:59:59").getTime() : null
                        )
                      }
                      aria-label={`Season end date for ${t.name}`}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      defaultValue=""
                      aria-label={`Assign a coach to ${t.name}`}
                      onChange={(e) => e.target.value && assignCoachToTeam(e.target.value, t.id)}
                    >
                      <option value="">Select coach…</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={() => {
                        if (confirm(`End season for "${t.name}" and unlink all members?`))
                          endTeamSeason(actor, t.id);
                      }}
                    >
                      End season now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        After the season-end date, members are automatically unlinked from a team
        (they lose access on their next sign-in). “End season now” removes everyone
        immediately.
      </p>
    </Card>
  );
}
