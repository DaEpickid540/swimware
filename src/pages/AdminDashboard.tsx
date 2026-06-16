/**
 * Admin dashboard + management panel: high-level stats, user list with
 * role promote/demote + deactivate (via callable functions), and recent audit
 * activity. Demonstrates the admin-only management flows end to end.
 */
import { useMemo, useState } from "react";
import { collection, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useQueryData } from "@/hooks/useCollection";
import { callSetUserRole, callSetUserActive } from "@/services/functions";
import type { AppUser, Team, AuditLog, Role } from "@/types/models";
import { Card, StatTile, Spinner, Badge, EmptyState } from "@/components/ui";

export default function AdminDashboard() {
  const usersQ = useMemo(() => query(collection(db, "users"), limit(200)), []);
  const teamsQ = useMemo(() => collection(db, "teams"), []);
  const auditQ = useMemo(
    () => query(collection(db, "auditLogs"), orderBy("at", "desc"), limit(15)),
    []
  );

  const { data: users, loading } = useQueryData<AppUser>(usersQ);
  const { data: teams } = useQueryData<Team>(teamsQ as never);
  const { data: audit } = useQueryData<AuditLog>(auditQ);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
    setBusyUid(uid);
    try {
      await callSetUserRole({ targetUid: uid, role });
    } finally {
      setBusyUid(null);
    }
  }

  async function toggleActive(u: AppUser) {
    setBusyUid(u.id);
    try {
      await callSetUserActive({ targetUid: u.id, active: !(u.active ?? true) });
    } finally {
      setBusyUid(null);
    }
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
