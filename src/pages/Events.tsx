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
