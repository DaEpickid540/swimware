/**
 * Auth state + role.
 *
 * Role model (no Cloud Functions): the role lives in users/{uid}.role and is
 * provisioned on sign-in by provisionOnSignIn() (admin bootstrap / coach
 * pre-registration). Firestore rules trust this doc because the only way to
 * obtain each role is gated server-side by the rules themselves.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signOut as fbSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query as fsQuery,
  where,
  documentId,
} from "firebase/firestore";
import { auth, db, googleProvider } from "@/services/firebase";
import { provisionOnSignIn } from "@/services/onboarding";
import type { AppUser, Role } from "@/types/models";

interface AuthState {
  firebaseUser: User | null;
  profile: AppUser | null;
  role: Role | null;
  /** What the UI should render as. For admins this can be an impersonated
   *  portal (view-as); for everyone else it equals `role`. */
  effectiveRole: Role | null;
  viewAs: Role | null;
  setViewAs: (r: Role | null) => void;
  assignedTeams: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const VIEW_AS_KEY = "swimware.viewAs";

/**
 * Filters a list of team IDs down to the ones still ACTIVE — i.e. not archived
 * and whose season-end date hasn't passed. This is how members are effectively
 * "unlinked" from a team after the season ends without any scheduled job: the
 * app simply stops treating expired teams as joined. Falls back to the raw list
 * if the team docs can't be read, so a user is never accidentally locked out.
 */
async function filterActiveTeams(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  try {
    const active: string[] = [];
    for (let i = 0; i < teamIds.length; i += 10) {
      const chunk = teamIds.slice(i, i + 10);
      const snap = await getDocs(
        fsQuery(collection(db, "teams"), where(documentId(), "in", chunk))
      );
      snap.forEach((d) => {
        const t = d.data();
        const ended =
          t.archived === true ||
          (typeof t.seasonEndDate === "number" && t.seasonEndDate < Date.now());
        if (!ended) active.push(d.id);
      });
    }
    return active;
  } catch {
    return teamIds;
  }
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [assignedTeams, setAssignedTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewAs, setViewAsState] = useState<Role | null>(
    () => (sessionStorage.getItem(VIEW_AS_KEY) as Role | null) || null
  );

  function setViewAs(r: Role | null) {
    if (r) sessionStorage.setItem(VIEW_AS_KEY, r);
    else sessionStorage.removeItem(VIEW_AS_KEY);
    setViewAsState(r);
  }

  // Only admins may impersonate a portal; everyone else sees their real role.
  const effectiveRole: Role | null = role === "admin" && viewAs ? viewAs : role;

  async function hydrate(user: User | null) {
    if (!user) {
      setFirebaseUser(null);
      setProfile(null);
      setRole(null);
      setAssignedTeams([]);
      return;
    }
    setFirebaseUser(user);

    // Provision (admin bootstrap / coach pre-registration) then load the doc.
    // Failures here are non-fatal — the user simply lands on /pending.
    await provisionOnSignIn(user).catch(() => null);

    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() } as AppUser;
      setProfile(data);
      setRole(data.role ?? null);
      const raw = Array.isArray(data.assignedTeams) ? data.assignedTeams : [];
      // Drop teams whose season has ended (auto-unlink, no scheduled job).
      setAssignedTeams(await filterActiveTeams(raw));
    } else {
      setProfile(null);
      setRole(null);
      setAssignedTeams([]);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      try {
        await hydrate(user);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      firebaseUser,
      profile,
      role,
      effectiveRole,
      viewAs,
      setViewAs,
      assignedTeams,
      loading,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      signInWithGoogle: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      // Email/password sign-up. No role is granted here — provisionOnSignIn
      // decides (admin email → admin; pre-registered → coach; else /pending).
      signUpEmail: async (email, password) => {
        await createUserWithEmailAndPassword(auth, email, password);
      },
      signOut: () => {
        setViewAs(null);
        return fbSignOut(auth);
      },
      refresh: () => hydrate(auth.currentUser),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firebaseUser, profile, role, effectiveRole, viewAs, assignedTeams, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
