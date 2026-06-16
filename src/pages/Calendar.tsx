/**
 * Month-grid calendar — available to every role. Shows the user's team events
 * (admins see all) as colored chips per day; clicking a day lists that day's
 * events. Dependency-free, keyboard-accessible, responsive.
 */
import { useMemo, useState } from "react";
import { collection, limit, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { SwimEvent, EventType } from "@/types/models";
import { EVENT_TYPE_LABELS } from "@/config/constants";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_COLORS: Record<EventType, string> = {
  practice: "var(--color-primary)",
  meet: "var(--color-danger)",
  social: "var(--color-secondary)",
  meeting: "#7c3aed",
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export default function Calendar() {
  const { effectiveRole, assignedTeams } = useAuth();
  const isAdmin = effectiveRole === "admin";
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date | null>(new Date());

  const eventsQ = useMemo(() => {
    if (isAdmin) return query(collection(db, "events"), limit(500));
    if (assignedTeams.length)
      return query(collection(db, "events"), where("teamId", "in", assignedTeams.slice(0, 10)));
    return null;
  }, [isAdmin, assignedTeams]);
  const { data: events, loading } = useQueryData<SwimEvent>(eventsQ);

  // Group events by day-string for fast lookup.
  const byDay = useMemo(() => {
    const map = new Map<string, SwimEvent[]>();
    for (const e of events) {
      if (typeof e.startTime !== "number") continue;
      const key = new Date(e.startTime).toDateString();
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  // Build the 6-week grid (leading/trailing days from adjacent months).
  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay()); // back to Sunday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = new Date();
  const selectedEvents = selected ? (byDay.get(selected.toDateString()) ?? []) : [];

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <div className="cal-head">
        <h1 className="page__title" style={{ margin: 0 }}>
          {monthLabel}
        </h1>
        <div className="cal-nav">
          <button
            className="btn btn--sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button className="btn btn--sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Today
          </button>
          <button
            className="btn btn--sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="cal-grid" role="grid" aria-label={`Calendar for ${monthLabel}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-dow" role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayEvents = byDay.get(d.toDateString()) ?? [];
          const isToday = sameDay(d, today);
          const isSel = selected && sameDay(d, selected);
          return (
            <button
              key={d.toISOString()}
              role="gridcell"
              className={`cal-cell${inMonth ? "" : " is-out"}${isToday ? " is-today" : ""}${isSel ? " is-sel" : ""}`}
              onClick={() => setSelected(d)}
              aria-label={`${d.toDateString()}, ${dayEvents.length} event(s)`}
              aria-pressed={!!isSel}
            >
              <span className="cal-num">{d.getDate()}</span>
              <span className="cal-chips">
                {dayEvents.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className="cal-chip"
                    style={{ background: TYPE_COLORS[e.type] }}
                    title={e.title}
                  >
                    {e.title}
                  </span>
                ))}
                {dayEvents.length > 3 && (
                  <span className="cal-more">+{dayEvents.length - 3} more</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <Card title={selected ? selected.toDateString() : "Select a day"}>
        {selectedEvents.length === 0 ? (
          <EmptyState message="No events on this day." />
        ) : (
          <ul className="list">
            {selectedEvents
              .sort((a, b) => Number(a.startTime) - Number(b.startTime))
              .map((e) => {
                const t = typeof e.startTime === "number" ? new Date(e.startTime) : null;
                return (
                  <li key={e.id}>
                    <strong>{e.title}</strong> <Badge tone="neutral">{EVENT_TYPE_LABELS[e.type]}</Badge>{" "}
                    {t && (
                      <span className="muted">
                        {t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                    {e.location && <span className="muted"> · 📍 {e.location}</span>}
                  </li>
                );
              })}
          </ul>
        )}
      </Card>
    </div>
  );
}
