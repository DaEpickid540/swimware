/** Small standalone pages: pending-approval and 404. */
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui";

export function Pending() {
  const { signOut, profile } = useAuth();
  return (
    <div className="auth-screen">
      <Card title="Account pending">
        <p>
          Hi {profile?.displayName ?? "there"} — your account doesn’t have a role
          assigned yet. If you’re a coach, an admin needs to approve you. If you’re
          a swimmer, please use the invite link from your coach.
        </p>
        <button className="btn" onClick={() => signOut()}>
          Sign out
        </button>
      </Card>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="auth-screen">
      <Card title="Page not found">
        <p>That page doesn’t exist.</p>
        <Link className="btn" to="/">
          Go home
        </Link>
      </Card>
    </div>
  );
}
