/**
 * First-run welcome guide. Shows a short, role-specific intro the first time a
 * user lands in the app, then never again (dismissal stored per uid+role in
 * localStorage). Admins get no guide. Fully keyboard-accessible modal.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types/models";

interface Step {
  icon: string;
  title: string;
  body: string;
}

const GUIDES: Partial<Record<Role, { heading: string; steps: Step[] }>> = {
  coach: {
    heading: "Welcome, Coach! 🏊",
    steps: [
      { icon: "🗓️", title: "Build your schedule", body: "Create practices, meets, and socials for your teams from the Events page." },
      { icon: "🔗", title: "Invite swimmers", body: "Generate single-use invite links (you choose how long they last) and share them with families." },
      { icon: "👥", title: "Manage your roster", body: "Track attendance, log times, and message your team in the monitored group chat." },
      { icon: "✨", title: "AI helpers", body: "Summarize your week or draft announcements — add your own free Groq key in AI Tools." },
    ],
  },
  swimmer: {
    heading: "Welcome to the team! 🐟",
    steps: [
      { icon: "🗓️", title: "See what's next", body: "Your upcoming practices and meets are right on your dashboard." },
      { icon: "✅", title: "RSVP to events", body: "Let your coach know if you're going, maybe, or can't make it." },
      { icon: "💬", title: "Team chat", body: "Chat with your whole team. It's group-only and watched by coaches for safety." },
      { icon: "📈", title: "Track your progress", body: "Check your best times and improvement on the My Progress page." },
    ],
  },
  parent: {
    heading: "Welcome, Guardian! 👋",
    steps: [
      { icon: "🗓️", title: "Follow the schedule", body: "See your swimmer's upcoming practices, meets, and team announcements." },
      { icon: "👀", title: "Read-only chat", body: "You can view the team's monitored group chat so you always know what's shared." },
      { icon: "🔒", title: "Safe by design", body: "All communication is group-based — there is no private adult–minor messaging." },
    ],
  },
};

export function WelcomeGuide() {
  const { firebaseUser, effectiveRole } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [step, setStep] = useState(0);

  const storageKey =
    firebaseUser && effectiveRole ? `swimware.welcome.${firebaseUser.uid}.${effectiveRole}` : null;

  useEffect(() => {
    // No guide for admins or signed-out users.
    if (!storageKey || !effectiveRole || effectiveRole === "admin" || !GUIDES[effectiveRole]) {
      setDismissed(true);
      return;
    }
    setStep(0);
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey, effectiveRole]);

  if (dismissed || !effectiveRole || !GUIDES[effectiveRole]) return null;
  const guide = GUIDES[effectiveRole]!;
  const isLast = step === guide.steps.length - 1;
  const cur = guide.steps[step];

  function finish() {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-heading">
      <div className="welcome__backdrop" onClick={finish} />
      <div className="welcome__card">
        <button className="welcome__skip" onClick={finish} aria-label="Skip introduction">
          Skip
        </button>
        <h2 id="welcome-heading" className="welcome__heading">
          {guide.heading}
        </h2>

        <div className="welcome__step" aria-live="polite">
          <div className="welcome__icon" aria-hidden="true">
            {cur.icon}
          </div>
          <h3>{cur.title}</h3>
          <p>{cur.body}</p>
        </div>

        <div className="welcome__dots" aria-hidden="true">
          {guide.steps.map((_, i) => (
            <span key={i} className={`welcome__dot${i === step ? " is-active" : ""}`} />
          ))}
        </div>

        <div className="welcome__actions">
          {step > 0 && (
            <button className="btn" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          {isLast ? (
            <button className="btn btn--primary" onClick={finish}>
              Get started
            </button>
          ) : (
            <button className="btn btn--primary" onClick={() => setStep((s) => s + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
