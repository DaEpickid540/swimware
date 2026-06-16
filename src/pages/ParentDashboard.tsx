/**
 * Parent / guardian dashboard — READ-ONLY visibility into their linked
 * swimmer(s): upcoming team events, announcements, and read-only access to the
 * team's monitored group chat. Parents cannot post messages or change data;
 * this exists to satisfy guardian-visibility youth-safety expectations.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { SwimEvent, NewsItem, AppUser } from "@/types/models";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";

export default function ParentDashboard() {
  const { profile, assignedTeams } = useAuth();
  const linkedSwimmers = profile?.linkedSwimmers ?? [];

  const swimmersQ = useMemo(
    () =>
      linkedSwimmers.length
        ? query(collection(db, "users"), where("__name__", "in", linkedSwimmers.slice(0, 10)))
        : null,
    [linkedSwimmers]
  );
  const { data: swimmers } = useQueryData<AppUser>(swimmersQ as never);

  const eventsQ = useMemo(
    () =>
      assignedTeams.length
        ? query(
            collection(db, "events"),
            where("teamId", "in", assignedTeams.slice(0, 10)),
            orderBy("startTime", "asc"),
            limit(8)
          )
        : null,
    [assignedTeams]
  );
  const { data: events, loading } = useQueryData<SwimEvent>(eventsQ);

  const newsQ = useMemo(
    () => query(collection(db, "news"), orderBy("createdAt", "desc"), limit(8)),
    []
  );
  const { data: news } = useQueryData<NewsItem>(newsQ);

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">Hi, {profile?.displayName} 👋</h1>

      <div className="callout callout--safety" role="note">
        <strong>Guardian view.</strong> You have read-only access to your swimmer’s
        schedule, announcements, and the team’s <em>monitored group chat</em>. All
        communication is group-based — there is no private adult–minor messaging.
      </div>

      <div className="grid grid--2">
        <Card title="My swimmer(s)">
          {swimmers.length === 0 ? (
            <EmptyState message="No linked swimmers found for your email." />
          ) : (
            <ul className="list">
              {swimmers.map((s) => (
                <li key={s.id}>
                  <strong>{s.displayName}</strong>{" "}
                  {s.age ? <span className="muted">age {s.age}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn--sm" to="/chat">
            View team chat (read-only)
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

      <Card title="Upcoming events">
        {events.length === 0 ? (
          <EmptyState message="No upcoming events." />
        ) : (
          <ul className="list">
            {events.map((ev) => {
              const when =
                typeof ev.startTime === "number" ? new Date(ev.startTime).toLocaleString() : "TBD";
              return (
                <li key={ev.id}>
                  <strong>{ev.title}</strong> <Badge tone="neutral">{ev.type}</Badge>{" "}
                  <span className="muted">{when}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
