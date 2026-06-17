/**
 * SwimCloud quick-access page (swimmers + parents). Provides convenient access
 * to a site the team already uses. Linking is the safe path; the embed is a
 * convenience and may be blocked by SwimCloud's headers (fallback link shown).
 */
import { ExternalEmbed } from "@/components/ExternalEmbed";

export default function SwimCloud() {
  return (
    <div className="page">
      <h1 className="page__title">SwimCloud</h1>
      <p className="muted">
        Times, rankings, and results on SwimCloud — a site the Rays use.
      </p>
      <ExternalEmbed url="https://www.swimcloud.com/" title="SwimCloud" />
    </div>
  );
}
