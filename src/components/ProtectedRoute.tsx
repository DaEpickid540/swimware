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
  const { firebaseUser, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your account…" />;
  if (!firebaseUser) return <Navigate to="/login" state={{ from: location }} replace />;

  // Signed in but no role yet (e.g. a coach awaiting approval).
  if (allow && (!role || !allow.includes(role))) {
    return <Navigate to="/pending" replace />;
  }
  return <>{children}</>;
}
