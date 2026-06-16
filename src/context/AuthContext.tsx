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
import { doc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/services/firebase";
import { provisionOnSignIn } from "@/services/onboarding";
import type { AppUser, Role } from "@/types/models";

interface AuthState {
  firebaseUser: User | null;
  profile: AppUser | null;
  role: Role | null;
  assignedTeams: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [assignedTeams, setAssignedTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
      setAssignedTeams(Array.isArray(data.assignedTeams) ? data.assignedTeams : []);
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
      signOut: () => fbSignOut(auth),
      refresh: () => hydrate(auth.currentUser),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firebaseUser, profile, role, assignedTeams, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
