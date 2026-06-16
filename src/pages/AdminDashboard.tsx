/**
 * Admin dashboard + management panel: high-level stats, user list with
 * role promote/demote + deactivate (via callable functions), and recent audit
 * activity. Demonstrates the admin-only management flows end to end.
 */
import { useMemo, useState } from "react";
import { collection, deleteDoc, doc, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useQueryData } from "@/hooks/useCollection";
import { setUserRole, setUserActive, preRegisterCoach } from "@/services/onboarding";
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
