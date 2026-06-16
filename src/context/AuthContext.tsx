/**
 * Auth state + role. The role comes from the ID token's custom claims (set
 * server-side by Cloud Functions), NOT from anything the client can set. We
 * also load the user's Firestore profile doc for display fields.
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
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "@/services/firebase";
import type { AppUser, Role } from "@/types/models";

interface AuthState {
  firebaseUser: User | null;
  profile: AppUser | null;
  role: Role | null;
  assignedTeams: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpCoach: (email: string, password: string, displayName: string) => Promise<void>;
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
    // Force-refresh the token so freshly-minted claims (role/teams) are present.
    const tokenResult = await user.getIdTokenResult(true);
    setFirebaseUser(user);
    setRole((tokenResult.claims.role as Role) ?? null);
    setAssignedTeams((tokenResult.claims.assignedTeams as string[]) ?? []);

    const snap = await getDoc(doc(db, "users", user.uid));
    setProfile(snap.exists() ? ({ id: snap.id, ...snap.data() } as AppUser) : null);
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
      // Google sign-in. Admins are auto-promoted by the onAuthUserCreate
      // Cloud Function; everyone else lands on /pending until a role is granted
      // (coach approval or swimmer invite). We never auto-grant a role here.
      signInWithGoogle: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      // Coaches may self-register; they get the 'coach' role only after an admin
      // confirms (rules allow them to create their own profile doc as 'coach').
      signUpCoach: async (email, password, displayName) => {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), {
          role: "coach",
          email: cred.user.email,
          displayName,
          assignedTeams: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
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
