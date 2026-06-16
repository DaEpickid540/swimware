/**
 * Chat page: pick one of the user's team chats, then render the ChatRoom.
 * Chats are keyed to a team (doc id = teamId for the default team_chat).
 */
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { Team } from "@/types/models";
import { ChatRoom } from "@/components/ChatRoom";
import { Card, Spinner, EmptyState } from "@/components/ui";

export default function Chat() {
  const { assignedTeams, role } = useAuth();
  const isStaff = role === "admin" || role === "coach";

  const teamsQ = useMemo(
    () =>
      assignedTeams.length
        ? query(collection(db, "teams"), where("__name__", "in", assignedTeams.slice(0, 10)))
        : isStaff
        ? collection(db, "teams")
        : null,
    [assignedTeams, isStaff]
  );
  const { data: teams, loading } = useQueryData<Team>(teamsQ as never);
  const [activeTeam, setActiveTeam] = useState<string>("");

  useEffect(() => {
    if (!activeTeam && teams.length) setActiveTeam(teams[0].id);
  }, [teams, activeTeam]);

  // Ensure a chat doc exists for the team (id === teamId). Idempotent.
  useEffect(() => {
    if (!activeTeam) return;
    const ref = doc(db, "chats", activeTeam);
    getDoc(ref).then((snap) => {
      if (!snap.exists() && isStaff) {
        setDoc(ref, {
          teamId: activeTeam,
          type: "team_chat",
          mutedUsers: [],
          createdAt: serverTimestamp(),
        });
      }
    });
  }, [activeTeam, isStaff]);

  if (loading) return <Spinner />;
  if (teams.length === 0) return <EmptyState message="You’re not in any team chats yet." />;

  return (
    <div className="page">
      <h1 className="page__title">Team chat</h1>
      <div className="toolbar">
        <label htmlFor="chat-team">Team</label>
        <select
          id="chat-team"
          className="input"
          value={activeTeam}
          onChange={(e) => setActiveTeam(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <Card>{activeTeam && <ChatRoom chatId={activeTeam} />}</Card>
    </div>
  );
}
