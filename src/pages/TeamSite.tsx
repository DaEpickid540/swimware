/**
 * Mason Rec Rays team site quick-access (all roles). Embeds the official
 * GoMotion team home with a robust "open in new tab" fallback (GoMotion may
 * block embedding) and meet sign-in instructions.
 */
import { ExternalEmbed } from "@/components/ExternalEmbed";
import { TEAM_SITE_URL } from "@/config/constants";

export default function TeamSite() {
  return (
    <div className="page">
      <h1 className="page__title">Mason Rec Rays — Team Site</h1>
      <p className="muted">
        The official team site on GoMotion — used for meet sign-ups and team info.
      </p>

      <ExternalEmbed url={TEAM_SITE_URL} title="Mason Rec Rays on GoMotion">
        <div className="callout callout--info" role="note">
          <strong>To sign up for meets:</strong> on the team site, hit{" "}
          <strong>“Sign In” in the top-right corner</strong> to log in (or create an
          account there), then register for meets and events.
          <br />
          <span className="muted">
            This is a convenient link to the team’s GoMotion site — it’s a separate
            program with its own account and sign-in.
          </span>
        </div>
      </ExternalEmbed>
    </div>
  );
}
