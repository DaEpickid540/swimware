/**
 * Accessible, real-time team chat.
 *  - Messages stream via onSnapshot.
 *  - New messages are announced to screen readers through an aria-live region
 *    (polite, off-screen) without stealing focus.
 *  - Coaches/admins can delete any message (basic moderation). Authors can
 *    delete their own.
 *  - Fully keyboard operable; the composer is a labelled form.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { ChatMessage } from "@/types/models";
import { friendlyMessage } from "@/utils/errors";
import { Spinner, EmptyState } from "./ui";

const MAX_MESSAGE_LENGTH = 2000;

export function ChatRoom({ chatId }: { chatId: string }) {
  const { firebaseUser, profile, role } = useAuth();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const messagesQuery = useMemo(
    () =>
      query(
        collection(db, "chats", chatId, "messages"),
        orderBy("createdAt", "asc"),
        limit(200)
      ),
    [chatId]
  );
  const { data: messages, loading } = useQueryData<ChatMessage>(messagesQuery);

  const isStaff = role === "admin" || role === "coach";
  // Parents/guardians get read-only access (no posting, no deleting).
  const readOnly = role === "parent";

  // Announce the newest message + autoscroll when the list grows.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last) setLiveMessage(`${last.senderName ?? "Someone"} said: ${last.text}`);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [lastId, messages]);

  const [sendError, setSendError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed || !firebaseUser) return;
    setText("");
    setSendError(null);
    const msgRef = doc(collection(db, "chats", chatId, "messages"));
    const batch = writeBatch(db);
    batch.set(msgRef, {
      senderId: firebaseUser.uid,
      senderName: profile?.displayName ?? "Anonymous",
      text: trimmed,
      createdAt: serverTimestamp(),
    });
    // Bumps this sender's cooldown timestamp in the same batch as the
    // message create — rules require both to land together, so a message
    // can never be created without the rate-limit clock advancing too.
    batch.update(doc(db, "chats", chatId), { [`lastMessageAt.${firebaseUser.uid}`]: Date.now() });
    try {
      await batch.commit();
    } catch (err) {
      setSendError(friendlyMessage(err, "Message not sent — please try again in a moment."));
    }
  }

  async function remove(messageId: string) {
    await deleteDoc(doc(db, "chats", chatId, "messages", messageId));
  }

  async function report(messageId: string, currentReportedBy: string[] | undefined) {
    if (!firebaseUser || currentReportedBy?.includes(firebaseUser.uid)) return;
    await updateDoc(doc(db, "chats", chatId, "messages", messageId), {
      reported: true,
      reportedBy: arrayUnion(firebaseUser.uid),
    });
  }

  if (loading) return <Spinner label="Loading messages…" />;

  return (
    <div className="chat" role="region" aria-label="Team chat">
      {/* Youth-safety transparency notice (Ohio adult–minor communication). */}
      <p className="chat__notice" role="note">
        👥 Group chat — visible to your whole team and coaches, and monitored for
        safety. There is no private messaging. Parents/guardians may review these
        messages via the swimmer’s account.
      </p>
      {/* Off-screen live region announces new messages without moving focus. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>

      <ol className="chat__list" ref={listRef} aria-label="Messages">
        {messages.length === 0 && <EmptyState message="No messages yet. Say hello! 👋" />}
        {messages.map((m) => {
          const mine = m.senderId === firebaseUser?.uid;
          const alreadyReported = !!firebaseUser && !!m.reportedBy?.includes(firebaseUser.uid);
          return (
            <li key={m.id} className={`chat__msg${mine ? " chat__msg--mine" : ""}`}>
              <div className="chat__meta">
                <span className="chat__author">{m.senderName ?? "Unknown"}</span>
                {isStaff && m.reported && (
                  <span className="chat__reported" role="status">
                    🚩 Reported
                  </span>
                )}
              </div>
              <div className="chat__bubble">{m.text}</div>
              <div className="chat__actions">
                {!readOnly && !mine && (
                  <button
                    className="chat__report"
                    onClick={() => report(m.id, m.reportedBy)}
                    disabled={alreadyReported}
                    aria-label={`Report message from ${m.senderName ?? "user"}`}
                  >
                    {alreadyReported ? "Reported" : "Report"}
                  </button>
                )}
                {!readOnly && (mine || isStaff) && (
                  <button
                    className="chat__delete"
                    onClick={() => remove(m.id)}
                    aria-label={`Delete message from ${m.senderName ?? "user"}`}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {readOnly ? (
        <p className="chat__readonly" role="note">
          👀 Read-only — guardians can view but not post in team chat.
        </p>
      ) : (
        <form className="chat__composer" onSubmit={send}>
          <label htmlFor="chat-input" className="sr-only">
            Type a message
          </label>
          <input
            id="chat-input"
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            autoComplete="off"
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <button type="submit" className="btn btn--primary" disabled={!text.trim()}>
            Send
          </button>
          {sendError && (
            <p className="form-error" role="alert">
              {sendError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
