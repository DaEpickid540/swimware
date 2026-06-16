/**
 * Coach roster management: list swimmers on the coach's teams, with CSV export
 * and a free "copy parent-email template" action (no paid email service).
 */
import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { AppUser } from "@/types/models";
import { Card, Spinner, EmptyState } from "@/components/ui";
import { downloadCsv } from "@/services/csv";

export default function Roster() {
  const { assignedTeams } = useAuth();

  const swimmersQ = useMemo(
    () =>
      assignedTeams.length
        ? query(
            collection(db, "users"),
            where("role", "==", "swimmer"),
            where("assignedTeams", "array-contains-any", assignedTeams.slice(0, 10))
          )
        : null,
    [assignedTeams]
  );
  const { data: swimmers, loading } = useQueryData<AppUser>(swimmersQ);

  function exportCsv() {
    downloadCsv(
      "roster.csv",
      swimmers.map((s) => ({
        name: s.displayName,
        email: s.email ?? "",
        age: s.age ?? "",
        phone: s.phone ?? "",
        parentEmail: s.linkedParentEmail ?? "",
        emergencyContact: s.emergencyContact ?? "",
      }))
    );
  }

  // FREE alternative to paid email sending: build a parent-email template and
  // copy it to the clipboard (recipients + body) so a coach can paste it into
  // their own email client. No paid service, no Blaze, no server.
  const [copied, setCopied] = useState(false);
  async function copyEmailTemplate() {
    const recipients = swimmers
      .map((s) => s.linkedParentEmail)
      .filter((e): e is string => !!e)
      .join(", ");
    const template =
      `To (Bcc): ${recipients}\n\n` +
      `Subject: Mason Rec Rays — Team Update\n\n` +
      `Hi families,\n\n[Your message here]\n\nThank you,\nCoach`;
    await navigator.clipboard?.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">Roster</h1>
      <Card
        title={`${swimmers.length} swimmer(s)`}
        actions={
          <span className="row-actions">
            <button
              className="btn btn--sm"
              onClick={copyEmailTemplate}
              disabled={!swimmers.length}
              title="Copies parent emails + a message template to your clipboard (free — no email service needed)"
            >
              {copied ? "Copied ✓" : "Copy parent email"}
            </button>
            <button className="btn btn--sm" onClick={exportCsv} disabled={!swimmers.length}>
              Export CSV
            </button>
          </span>
        }
      >
        {swimmers.length === 0 ? (
          <EmptyState message="No swimmers on your teams yet. Send an invite link to add some." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Swimmers on your teams</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Age</th>
                  <th scope="col">Parent contact</th>
                  <th scope="col">Emergency contact</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {swimmers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.displayName}</td>
                    <td>{s.age ?? "—"}</td>
                    <td>{s.linkedParentEmail ?? "—"}</td>
                    <td>{s.emergencyContact ?? "—"}</td>
                    <td>{s.medicalNotes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
