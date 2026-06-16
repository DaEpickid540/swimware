/**
 * Notification bell with an accessible dropdown. Reads the signed-in user's
 * unread notifications in real time and lets them mark items read.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { AppNotification } from "@/types/models";
import { IconBell } from "@/components/icons";

export function NotificationBell() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const notifQ = useMemo(
    () =>
      firebaseUser
        ? query(
            collection(db, "notifications"),
            where("userId", "==", firebaseUser.uid),
            orderBy("createdAt", "desc"),
            limit(20)
          )
        : null,
    [firebaseUser]
  );
  const { data: notifs } = useQueryData<AppNotification>(notifQ);
  const unread = notifs.filter((n) => !n.read).length;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n: AppNotification) {
    if (!n.read) await updateDoc(doc(db, "notifications", n.id), { read: true });
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    await Promise.all(
      notifs.filter((n) => !n.read).map((n) => updateDoc(doc(db, "notifications", n.id), { read: true }))
    );
  }

  return (
    <div className="bell" ref={wrapRef}>
      <button
        type="button"
        className="iconbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <IconBell />
        {unread > 0 && (
          <span className="bell__badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="bell__menu" role="menu" aria-label="Notifications">
          <div className="bell__head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="link" onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>
          {notifs.length === 0 ? (
            <p className="bell__empty">You're all caught up 🎉</p>
          ) : (
            <ul className="bell__list">
              {notifs.map((n) => (
                <li key={n.id}>
                  <button
                    role="menuitem"
                    className={`bell__item${n.read ? "" : " is-unread"}`}
                    onClick={() => openItem(n)}
                  >
                    <span className="bell__title">{n.title}</span>
                    {n.body && <span className="bell__body">{n.body}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
