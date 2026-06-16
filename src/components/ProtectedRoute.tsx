/**
 * Route guard. Redirects unauthenticated users to /login and enforces role
 * access. This is a UX gate only — real enforcement is in Firestore rules.
 */
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types/models";
import { Spinner } from "./ui";

export function ProtectedRoute({
  children,
  allow,
}: {
  children: ReactNode;
  allow?: Role[];
}) {
  const { firebaseUser, role, effectiveRole, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your account…" />;
  if (!firebaseUser) return <Navigate to="/login" state={{ from: location }} replace />;

  // Admins may access any interface (real-admin override, e.g. "view as");
  // everyone else must match their effective role. No role yet → /pending.
  const allowed = !allow || role === "admin" || (!!effectiveRole && allow.includes(effectiveRole));
  if (!allowed) {
    return <Navigate to={role ? "/" : "/pending"} replace />;
  }
  return <>{children}</>;
}
