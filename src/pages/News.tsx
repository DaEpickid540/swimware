/**
 * News feed. Staff can post (with urgent flag + audience). Everyone sees items
 * targeted to them — Firestore rules enforce the actual visibility filtering.
 */
import { useMemo, useState } from "react";
import { addDoc, collection, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { NewsItem } from "@/types/models";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";

export default function News() {
  const { firebaseUser, role } = useAuth();
  const isStaff = role === "admin" || role === "coach";

  const newsQ = useMemo(
    () => query(collection(db, "news"), orderBy("createdAt", "desc"), limit(50)),
    []
  );
  const { data: news, loading } = useQueryData<NewsItem>(newsQ);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [audience, setAudience] = useState("all");

  async function post(e: React.FormEvent) {
    e.preventDefault();
    await addDoc(collection(db, "news"), {
      title,
      body,
      priority: urgent ? "high" : "normal",
      visibleTo: [audience],
      createdBy: firebaseUser?.uid ?? "",
      createdAt: serverTimestamp(),
    });
    setTitle("");
    setBody("");
    setUrgent(false);
  }

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">News &amp; announcements</h1>

      {isStaff && (
        <Card title="Post an announcement">
          <form onSubmit={post}>
            <div className="field">
              <label htmlFor="news-title">Title</label>
              <input id="news-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="news-body">Message</label>
              <textarea id="news-body" className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="news-aud">Audience</label>
                <select id="news-aud" className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
                  <option value="all">Everyone</option>
                  <option value="swimmers">Swimmers</option>
                  <option value="coaches">Coaches</option>
                </select>
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
                Mark urgent
              </label>
            </div>
            <button className="btn btn--primary" type="submit">Post</button>
          </form>
        </Card>
      )}

      {news.length === 0 ? (
        <EmptyState message="No announcements yet." />
      ) : (
        <div className="news-feed">
          {news.map((n) => (
            <article key={n.id} className={`news-item${n.priority === "high" ? " news-item--urgent" : ""}`}>
              <header>
                <h2>
                  {n.priority === "high" && <Badge tone="danger">Urgent</Badge>} {n.title}
                </h2>
              </header>
              <p>{n.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
