/**
 * Events: filterable list of practices/meets/etc., a create form for staff,
 * and swimmer RSVP controls. (A full month-grid calendar can be layered on top
 * of this same data; the list view is the accessible default.)
 */
import { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  query,
  serverTimestamp,
  setDoc,
  doc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { SwimEvent, EventType, Team, Signup, RsvpStatus } from "@/types/models";
import { EVENT_TYPE_LABELS } from "@/config/constants";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";

export default function Events() {
  const { firebaseUser, profile, role, assignedTeams } = useAuth();
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
  const { data: teams } = useQueryData<Team>(teamsQ as never);

  const eventsQ = useMemo(
    () =>
      assignedTeams.length
        ? query(collection(db, "events"), where("teamId", "in", assignedTeams.slice(0, 10)))
        : null,
    [assignedTeams]
  );
  const { data: events, loading } = useQueryData<SwimEvent>(eventsQ);

  const myRsvpQ = useMemo(
    () =>
      firebaseUser
        ? query(collection(db, "signups"), where("swimmerId", "==", firebaseUser.uid))
        : null,
    [firebaseUser]
  );
  const { data: myRsvps } = useQueryData<Signup>(myRsvpQ);
  const rsvpByEvent = new Map(myRsvps.map((r) => [r.eventId, r]));

  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");

  const filtered = events
    .filter((e) => typeFilter === "all" || e.type === typeFilter)
    .sort((a, b) => Number(a.startTime ?? 0) - Number(b.startTime ?? 0));

  async function rsvp(ev: SwimEvent, status: RsvpStatus) {
    if (!firebaseUser) return;
    const id = `${ev.id}_${firebaseUser.uid}`;
    await setDoc(doc(db, "signups", id), {
      eventId: ev.id,
      teamId: ev.teamId,
      swimmerId: firebaseUser.uid,
      swimmerName: profile?.displayName ?? "",
      status,
      timestamp: serverTimestamp(),
    });
  }

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">Events &amp; schedule</h1>

      <div className="toolbar">
        <label htmlFor="type-filter">Filter by type</label>
        <select
          id="type-filter"
          className="input"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as EventType | "all")}
        >
          <option value="all">All types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {isStaff && <CreateEvent teams={teams} createdBy={firebaseUser?.uid ?? ""} />}
      {isStaff && <PracticeScheduler teams={teams} createdBy={firebaseUser?.uid ?? ""} />}

      {filtered.length === 0 ? (
        <EmptyState message="No events match your filters." />
      ) : (
        <div className="grid grid--2">
          {filtered.map((ev) => {
            const when =
              typeof ev.startTime === "number" ? new Date(ev.startTime).toLocaleString() : "TBD";
            const mine = rsvpByEvent.get(ev.id);
            return (
              <Card key={ev.id} title={ev.title}>
                <p>
                  <Badge tone="neutral">{EVENT_TYPE_LABELS[ev.type]}</Badge> {when}
                </p>
                {ev.location && <p className="muted">📍 {ev.location}</p>}
                {ev.description && <p>{ev.description}</p>}

                {role === "swimmer" && (
                  <div className="rsvp" role="group" aria-label={`RSVP for ${ev.title}`}>
                    {(["going", "maybe", "not_going"] as RsvpStatus[]).map((s) => (
                      <button
                        key={s}
                        className={`btn btn--sm${mine?.status === s ? " is-active" : ""}`}
                        aria-pressed={mine?.status === s}
                        onClick={() => rsvp(ev, s)}
                      >
                        {s === "not_going" ? "Not going" : s[0].toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateEvent({ teams, createdBy }: { teams: Team[]; createdBy: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState("");
  const [type, setType] = useState<EventType>("practice");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await addDoc(collection(db, "events"), {
      teamId,
      type,
      title,
      location,
      startTime: start ? new Date(start).getTime() : null,
      endTime: null,
      isRecurring: false,
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setTitle("");
    setLocation("");
    setStart("");
    setOpen(false);
  }

  return (
    <Card
      title="Create event"
      actions={
        <button className="btn btn--sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Close" : "New event"}
        </button>
      }
    >
      {open && (
        <form onSubmit={submit} className="form-grid">
          <div className="field">
            <label htmlFor="ev-title">Title</label>
            <input id="ev-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="ev-team">Team</label>
            <select id="ev-team" className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
              <option value="">Select…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ev-type">Type</label>
            <select id="ev-type" className="input" value={type} onChange={(e) => setType(e.target.value as EventType)}>
              {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ev-loc">Location</label>
            <input id="ev-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ev-start">Start</label>
            <input id="ev-start" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <button className="btn btn--primary" type="submit">Save event</button>
        </form>
      )}
    </Card>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * "Typical practice days" — a coach picks which weekdays they practice, a time,
 * and how many weeks ahead to generate. The app creates a recurring set of
 * practice events on the calendar in one batched write.
 */
function PracticeScheduler({ teams, createdBy }: { teams: Team[]; createdBy: string }) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]); // Mon/Wed/Fri
  const [time, setTime] = useState("17:00");
  const [weeks, setWeeks] = useState(8);
  const [location, setLocation] = useState("");
  const [title, setTitle] = useState("Practice");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleDay(d: number) {
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));
  }

  // Compute all practice datetimes for the chosen weekdays across `weeks` weeks.
  function buildDates(): number[] {
    const [h, m] = time.split(":").map(Number);
    const out: number[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (weekdays.includes(d.getDay())) {
        d.setHours(h, m, 0, 0);
        if (d.getTime() >= Date.now()) out.push(d.getTime());
      }
    }
    return out;
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (!teamId) return setResult("Pick a team first.");
    if (weekdays.length === 0) return setResult("Pick at least one practice day.");
    setBusy(true);
    try {
      const dates = buildDates();
      // Firestore batches are limited to 500 writes; practices fit comfortably.
      const batch = writeBatch(db);
      for (const startTime of dates) {
        const ref = doc(collection(db, "events"));
        batch.set(ref, {
          teamId,
          type: "practice",
          title,
          location,
          startTime,
          endTime: startTime + 60 * 60 * 1000, // default 1h
          isRecurring: true,
          recurrenceRule: `weekly:${weekdays.join(",")}`,
          createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setResult(`✅ Added ${dates.length} practice${dates.length === 1 ? "" : "s"} to the calendar.`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Could not create practices.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Set typical practice days"
      actions={
        <button className="btn btn--sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Close" : "Schedule practices"}
        </button>
      }
    >
      <p className="muted">
        Generate recurring practices automatically — pick your usual days &amp; time
        and how far ahead to schedule.
      </p>
      {open && (
        <form onSubmit={generate} className="form-grid">
          <div className="field">
            <label htmlFor="ps-team">Team</label>
            <select id="ps-team" className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
              <option value="">Select…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ps-title">Title</label>
            <input id="ps-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field field--full">
            <label>Practice days</label>
            <div className="day-toggles" role="group" aria-label="Practice weekdays">
              {WEEKDAY_LABELS.map((lbl, i) => (
                <button
                  type="button"
                  key={lbl}
                  className={`day-toggle${weekdays.includes(i) ? " is-active" : ""}`}
                  aria-pressed={weekdays.includes(i)}
                  onClick={() => toggleDay(i)}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="ps-time">Start time</label>
            <input id="ps-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="ps-weeks">Schedule ahead</label>
            <select id="ps-weeks" className="input" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              <option value={4}>4 weeks</option>
              <option value={8}>8 weeks</option>
              <option value={12}>12 weeks</option>
            </select>
          </div>
          <div className="field field--full">
            <label htmlFor="ps-loc">Location</label>
            <input id="ps-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Community pool" />
          </div>

          <button className="btn btn--primary field--full" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Generate practices"}
          </button>
          {result && <p className="field--full" role="status">{result}</p>}
        </form>
      )}
    </Card>
  );
}
