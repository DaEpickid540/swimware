/**
 * Small real-time Firestore helpers built on onSnapshot. Returns live data,
 * loading and error state. Offline-friendly: Firestore serves cached data first
 * when persistence is enabled (see main.tsx).
 */

import { useEffect, useState } from "react";
import {
  onSnapshot,
  query,
  type Query,
  type DocumentData,
} from "firebase/firestore";

export function useQueryData<T extends { id: string }>(
  q: Query<DocumentData> | null
): { data: T[]; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!q) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(q),
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
    // The caller is responsible for memoizing `q`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return { data, loading, error };
}
