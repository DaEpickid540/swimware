/**
 * Swimmer dashboard: next events, recent announcements, quick link to their
 * own performance log.
 *
 * YOUTH-SAFETY: swimmers (minors) have NO AI tools and NO API-key entry — AI is
 * staff-only (adults). This avoids minors sending data to third-party AI
 * providers or handling paid API keys. See /ai route guard + navItems.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { SwimEvent, NewsItem } from "@/types/models";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";

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
    </div>
  );
}
