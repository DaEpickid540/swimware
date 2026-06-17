/**
 * Mason Swimming quick-access (all roles). Convenient access to the team's
 * official meet-registration site, with instructions to sign in there to
 * register for meets. Embed may be blocked by the site; fallback link shown.
 */
import { ExternalEmbed } from "@/components/ExternalEmbed";

export default function MasonSwimming() {
  return (
    <div className="page">
      <h1 className="page__title">Mason Swimming</h1>
      <p className="muted">
        The official Mason Swimming site — used for meet sign-ups and team info.
      </p>

      <ExternalEmbed url="https://www.masonswimming.org/page/home" title="Mason Swimming">
        <div className="callout callout--info" role="note">
          <strong>To sign up for meets:</strong> on the Mason Swimming site, hit{" "}
          <strong>“Sign In” in the top-right corner</strong> to log in (or create an
          account there), then register for meets and events.
          <br />
          <span className="muted">
            This is just a convenient link to a site the team already uses — it’s a
            separate program with its own account and sign-in.
          </span>
        </div>
      </ExternalEmbed>
    </div>
  );
}
