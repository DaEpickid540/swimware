/**
 * Swimmer performance log: shows the signed-in swimmer's logged times, computes
 * best time per (stroke, distance) as a simple personal-record view.
 */
import { useMemo } from "react";
import { collection, orderBy, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { PerformanceLog } from "@/types/models";
import { Card, Spinner, EmptyState } from "@/components/ui";
import { LineChart, type Point } from "@/components/Chart";

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return m > 0 ? `${m}:${s}` : `${s}s`;
}

export default function Performance() {
  const { firebaseUser } = useAuth();
  const logsQ = useMemo(
    () =>
      firebaseUser
        ? query(
            collection(db, "performanceLogs"),
            where("swimmerId", "==", firebaseUser.uid),
            orderBy("createdAt", "desc")
          )
        : null,
    [firebaseUser]
  );
  const { data: logs, loading } = useQueryData<PerformanceLog>(logsQ);

  // Personal records: best (lowest) time per stroke+distance.
  const prs = useMemo(() => {
    const map = new Map<string, PerformanceLog>();
    for (const l of logs) {
      const key = `${l.distance}-${l.stroke}`;
      const cur = map.get(key);
      if (!cur || l.time < cur.time) map.set(key, l);
    }
    return [...map.values()];
  }, [logs]);

  // Progress trend: pick the (stroke, distance) the swimmer has logged most,
  // and plot times in chronological order (lower time = improvement).
  const trend = useMemo<{ title: string; points: Point[] }>(() => {
    if (logs.length === 0) return { title: "", points: [] };
    const groups = new Map<string, PerformanceLog[]>();
    for (const l of logs) {
      const key = `${l.distance}-${l.stroke}`;
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    let best: [string, PerformanceLog[]] = ["", []];
    for (const entry of groups) if (entry[1].length > best[1].length) best = entry;
    const ordered = [...best[1]].sort(
      (a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0)
    );
    const points: Point[] = ordered.map((l, i) => ({
      label: `#${i + 1}`,
      value: l.time,
    }));
    return { title: best[0] ? `${best[1][0].distance}m ${best[1][0].stroke}` : "", points };
  }, [logs]);

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">My performance</h1>

      {trend.points.length >= 2 && (
        <Card title={`Progress — ${trend.title}`}>
          <p className="muted">Each point is a logged swim; an upward trend means faster times.</p>
          <LineChart
            data={trend.points}
            lowerIsBetter
            ariaLabel={`Time progression for ${trend.title} across ${trend.points.length} swims. Best time ${fmtTime(
              Math.min(...trend.points.map((p) => p.value))
            )}.`}
          />
        </Card>
      )}

      <Card title="Personal records">
        {prs.length === 0 ? (
          <EmptyState message="No times logged yet. Your coach will add these." />
        ) : (
          <ul className="pr-list">
            {prs.map((p) => (
              <li key={p.id}>
                <strong>
                  {p.distance}m {p.stroke}
                </strong>{" "}
                — {fmtTime(p.time)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="All logged times">
        {logs.length === 0 ? (
          <EmptyState message="Nothing logged yet." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">All logged swim times</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Distance</th>
                  <th scope="col">Stroke</th>
                  <th scope="col">Time</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.eventId ?? "—"}</td>
                    <td>{l.distance}m</td>
                    <td>{l.stroke}</td>
                    <td>{fmtTime(l.time)}</td>
                    <td>{l.notes ?? "—"}</td>
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
