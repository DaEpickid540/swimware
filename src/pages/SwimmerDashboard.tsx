/**
 * Swimmer dashboard: next events, recent announcements, quick link to their
 * own performance log, plus the limited swimmer AI helpers.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { SwimEvent, NewsItem } from "@/types/models";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";
import { explainSchedule, motivationalMessage } from "@/services/ai/prompts";

export default function SwimmerDashboard() {
  const { profile, assignedTeams } = useAuth();

  const eventsQ = useMemo(
    () =>
      assignedTeams.length
        ? query(
            collection(db, "events"),
            where("teamId", "in", assignedTeams.slice(0, 10)),
            orderBy("startTime", "asc"),
            limit(5)
          )
        : null,
    [assignedTeams]
  );
  const { data: events, loading } = useQueryData<SwimEvent>(eventsQ);

  const newsQ = useMemo(
    () => query(collection(db, "news"), orderBy("createdAt", "desc"), limit(5)),
    []
  );
  const { data: news } = useQueryData<NewsItem>(newsQ);

  const [aiOut, setAiOut] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  async function run(task: "schedule" | "motivate") {
    setAiBusy(true);
    setAiErr(null);
    setAiOut("");
    try {
      const res =
        task === "schedule"
          ? await explainSchedule(events)
          : await motivationalMessage(`${profile?.displayName} has upcoming practices.`);
      setAiOut(res.text);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "AI request failed.");
    } finally {
      setAiBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">Hi, {profile?.displayName} 👋</h1>

      <div className="grid grid--2">
        <Card title="Next events">
          {events.length === 0 ? (
            <EmptyState message="No upcoming events." />
          ) : (
            <ul className="list">
              {events.map((ev) => (
                <li key={ev.id}>
                  <strong>{ev.title}</strong> <Badge tone="neutral">{ev.type}</Badge>
                  <Link className="link" to={`/events?focus=${ev.id}`}>
                    {" "}
                    details
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn--sm" to="/swimmer/performance">
            My performance log
          </Link>
        </Card>

        <Card title="Recent announcements">
          {news.length === 0 ? (
            <EmptyState message="No announcements yet." />
          ) : (
            <ul className="list">
              {news.map((n) => (
                <li key={n.id}>
                  {n.priority === "high" && <Badge tone="danger">Urgent</Badge>} {n.title}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="AI helpers" accent>
        <p className="muted">
          Safe, swim-only helpers. Add your own API key in{" "}
          <Link className="link" to="/ai">
            AI Tools
          </Link>{" "}
          first.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => run("schedule")} disabled={aiBusy}>
            Explain my schedule
          </button>
          <button className="btn" onClick={() => run("motivate")} disabled={aiBusy}>
            Motivate me
          </button>
        </div>
        {aiBusy && <Spinner label="Thinking…" />}
        {aiErr && <p className="form-error" role="alert">{aiErr}</p>}
        {aiOut && <p className="ai-output" aria-live="polite">{aiOut}</p>}
      </Card>
    </div>
  );
}
