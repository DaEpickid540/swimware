/**
 * Team resources (heat sheets, meet info, waivers, etc.).
 *   - Coaches/admins ADD resources for their teams.
 *   - Everyone on a team can VIEW/open resources for that team.
 *
 * Two ways to add a resource:
 *   1) LINK (default, always free) — paste a URL (Google Drive, the GoMotion
 *      heat-sheet page, a PDF link, etc.). No Firebase Storage needed.
 *   2) UPLOAD a file — uses Firebase Storage. If Storage isn't enabled on the
 *      project yet, the upload fails gracefully and we point the coach to the
 *      free link option instead.
 *
 * Stored in the `documents` collection (security rules already scope it by team).
 */
import { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { Team } from "@/types/models";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";

interface ResourceDoc {
  id: string;
  teamId: string;
  title: string;
  category: string;
  type: "link" | "file";
  url: string;
  fileName?: string;
  uploadedBy: string;
}

const CATEGORIES = ["Heat sheet", "Meet info", "Waiver", "Schedule", "Other"];

export default function Resources() {
  const { firebaseUser, effectiveRole, assignedTeams } = useAuth();
  const isStaff = effectiveRole === "admin" || effectiveRole === "coach";

  const teamsQ = useMemo(() => {
    if (effectiveRole === "admin") return collection(db, "teams");
    if (assignedTeams.length)
      return query(collection(db, "teams"), where("__name__", "in", assignedTeams.slice(0, 10)));
    return null;
  }, [effectiveRole, assignedTeams]);
  const { data: teams } = useQueryData<Team>(teamsQ as never);

  const docsQ = useMemo(() => {
    if (effectiveRole === "admin") return collection(db, "documents");
    if (assignedTeams.length)
      return query(collection(db, "documents"), where("teamId", "in", assignedTeams.slice(0, 10)));
    return null;
  }, [effectiveRole, assignedTeams]);
  const { data: resources, loading } = useQueryData<ResourceDoc>(docsQ as never);

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">Resources</h1>

      {isStaff && teams.length > 0 && (
        <AddResource teams={teams} uploadedBy={firebaseUser?.uid ?? ""} />
      )}

      {resources.length === 0 ? (
        <EmptyState message="No resources yet. Coaches can add heat sheets, meet info, and more." />
      ) : (
        <div className="grid grid--2">
          {teams.map((t) => {
            const list = resources.filter((r) => r.teamId === t.id);
            if (list.length === 0) return null;
            return (
              <Card key={t.id} title={t.name}>
                <ul className="list">
                  {list.map((r) => (
                    <li key={r.id} className="row-between">
                      <span>
                        <a href={r.url} target="_blank" rel="noreferrer" className="link">
                          {r.type === "file" ? "📄" : "🔗"} {r.title}
                        </a>{" "}
                        <Badge tone="neutral">{r.category}</Badge>
                      </span>
                      {isStaff && (
                        <button
                          className="btn btn--sm"
                          onClick={() => deleteDoc(doc(db, "documents", r.id))}
                          aria-label={`Delete ${r.title}`}
                        >
                          Delete
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddResource({ teams, uploadedBy }: { teams: Team[]; uploadedBy: string }) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Heat sheet");
  const [mode, setMode] = useState<"link" | "file">("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!teamId || !title.trim()) {
      setMsg("Pick a team and a title.");
      return;
    }
    setBusy(true);
    try {
      let finalUrl = url.trim();
      let fileName: string | undefined;
      let type: "link" | "file" = "link";

      if (mode === "file") {
        if (!file) {
          setMsg("Choose a file to upload.");
          setBusy(false);
          return;
        }
        try {
          const r = ref(storage, `team-docs/${teamId}/${Date.now()}-${file.name}`);
          await uploadBytes(r, file);
          finalUrl = await getDownloadURL(r);
          fileName = file.name;
          type = "file";
        } catch {
          setMsg(
            "File upload failed — Firebase Storage isn’t enabled on this project. " +
              "Use the “Link” option instead (e.g. a Google Drive or PDF link), or " +
              "enable Storage in the Firebase console."
          );
          setBusy(false);
          return;
        }
      } else if (!finalUrl) {
        setMsg("Paste a link, or switch to upload.");
        setBusy(false);
        return;
      }

      await addDoc(collection(db, "documents"), {
        teamId,
        title: title.trim(),
        category,
        type,
        url: finalUrl,
        fileName: fileName ?? null,
        uploadedBy,
        createdAt: serverTimestamp(),
      });
      setTitle("");
      setUrl("");
      setFile(null);
      setMsg("✅ Resource added.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not add resource.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Add a resource"
      actions={
        <button className="btn btn--sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Close" : "Add resource"}
        </button>
      }
    >
      <p className="muted">
        Share heat sheets, meet info, and waivers with your team. Paste a link (free,
        works today) or upload a file if Storage is enabled.
      </p>
      {open && (
        <form onSubmit={submit} className="form-grid">
          <div className="field">
            <label htmlFor="rs-team">Team</label>
            <select id="rs-team" className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
              <option value="">Select…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rs-cat">Category</label>
            <select id="rs-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field field--full">
            <label htmlFor="rs-title">Title</label>
            <input id="rs-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Champs Heat Sheet — Saturday" required />
          </div>

          <div className="field field--full">
            <label>Source</label>
            <div className="seg" role="group" aria-label="Resource source">
              <button type="button" className={mode === "link" ? "is-active" : ""} aria-pressed={mode === "link"} onClick={() => setMode("link")}>
                🔗 Link
              </button>
              <button type="button" className={mode === "file" ? "is-active" : ""} aria-pressed={mode === "file"} onClick={() => setMode("file")}>
                📄 Upload file
              </button>
            </div>
          </div>

          {mode === "link" ? (
            <div className="field field--full">
              <label htmlFor="rs-url">Link URL</label>
              <input id="rs-url" type="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" />
            </div>
          ) : (
            <div className="field field--full">
              <label htmlFor="rs-file">File (PDF, image, etc.)</label>
              <input id="rs-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          )}

          <button className="btn btn--primary field--full" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add resource"}
          </button>
          {msg && <p className="field--full" role="status">{msg}</p>}
        </form>
      )}
    </Card>
  );
}
