/**
 * Routing + role-based home redirect. Pages are code-split with React.lazy so
 * the initial bundle stays small; an ErrorBoundary wraps everything and a
 * Suspense fallback shows a spinner during chunk loads.
 */
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Layout } from "@/components/Layout";
import { Spinner } from "@/components/ui";
import { ROLE_HOME } from "@/config/constants";

const Login = lazy(() => import("@/pages/Login"));
const InviteRegister = lazy(() => import("@/pages/InviteRegister"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const CoachDashboard = lazy(() => import("@/pages/CoachDashboard"));
const SwimmerDashboard = lazy(() => import("@/pages/SwimmerDashboard"));
const ParentDashboard = lazy(() => import("@/pages/ParentDashboard"));
const Events = lazy(() => import("@/pages/Events"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const SwimCloud = lazy(() => import("@/pages/SwimCloud"));
const TeamSite = lazy(() => import("@/pages/TeamSite"));
const Resources = lazy(() => import("@/pages/Resources"));
const Chat = lazy(() => import("@/pages/Chat"));
const News = lazy(() => import("@/pages/News"));
const Roster = lazy(() => import("@/pages/Roster"));
const AiTools = lazy(() => import("@/pages/AiTools"));
const Settings = lazy(() => import("@/pages/Settings"));
const Performance = lazy(() => import("@/pages/Performance"));

/** Sends a signed-in user to their (effective) role's dashboard. */
function Home() {
  const { role, effectiveRole, loading, firebaseUser } = useAuth();
  if (loading) return <Spinner />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!role) return <Navigate to="/pending" replace />;
  return <Navigate to={ROLE_HOME[effectiveRole ?? role]} replace />;
}

/** Wraps a page in the app shell + role guard. */
function Page({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow?: ("admin" | "coach" | "swimmer" | "parent")[];
}) {
  return (
    <ProtectedRoute allow={allow}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

// Misc default export holds both Pending and NotFound; re-export lazily.
const Pending = lazy(() => import("@/pages/Misc").then((m) => ({ default: m.Pending })));
const NotFound = lazy(() => import("@/pages/Misc").then((m) => ({ default: m.NotFound })));

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<Spinner label="Loading…" />}>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<Login />} />
                <Route path="/invite/:token" element={<InviteRegister />} />
                <Route path="/pending" element={<Pending />} />

                {/* Home redirect */}
                <Route path="/" element={<Home />} />

                {/* Role dashboards */}
                <Route path="/admin" element={<Page allow={["admin"]}><AdminDashboard /></Page>} />
                <Route path="/coach" element={<Page allow={["coach", "admin"]}><CoachDashboard /></Page>} />
                <Route path="/swimmer" element={<Page allow={["swimmer"]}><SwimmerDashboard /></Page>} />
                <Route path="/swimmer/performance" element={<Page allow={["swimmer"]}><Performance /></Page>} />
                <Route path="/parent" element={<Page allow={["parent"]}><ParentDashboard /></Page>} />

                {/* Shared (any signed-in role) */}
                <Route path="/calendar" element={<Page><Calendar /></Page>} />
                <Route path="/events" element={<Page><Events /></Page>} />
                <Route path="/swimcloud" element={<Page allow={["swimmer", "parent"]}><SwimCloud /></Page>} />
                <Route path="/team-site" element={<Page><TeamSite /></Page>} />
                <Route path="/resources" element={<Page><Resources /></Page>} />
                <Route path="/news" element={<Page><News /></Page>} />
                <Route path="/chat" element={<Page><Chat /></Page>} />
                {/* Settings is for everyone (appearance + profile); admin tabs gated inside */}
                <Route path="/settings" element={<Page><Settings /></Page>} />
                {/* AI tools are staff-only (no minors using open AI / keys) */}
                <Route path="/ai" element={<Page allow={["admin", "coach"]}><AiTools /></Page>} />

                {/* Staff */}
                <Route path="/roster" element={<Page allow={["coach", "admin"]}><Roster /></Page>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
