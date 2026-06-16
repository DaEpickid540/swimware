/**
 * First-run onboarding — REQUIRED (no skip / no dismiss-on-backdrop).
 *
 * Flow by role:
 *   coach           → role tour → AI setup (key required) → GitHub star
 *   admin           → AI setup (key required) → GitHub star   (no role tour)
 *   swimmer / parent → role tour → GitHub star                (no AI step)
 *
 * The AI step is mandatory for staff: they must enter an API key (Groq is free)
 * before continuing. Completion is stored per uid+role in localStorage.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { GITHUB_REPO_URL } from "@/config/constants";
import { getApiKey, setApiKey } from "@/services/ai/keyStore";
import { loadPreferences, savePreferences } from "@/services/ai/aiClient";
import type { AiProvider } from "@/services/ai/types";
import type { Role } from "@/types/models";

interface TourStep {
  icon: string;
  title: string;
  body: string;
}

const GUIDES: Partial<Record<Role, { heading: string; steps: TourStep[] }>> = {
  coach: {
    heading: "Welcome, Coach! 🏊",
    steps: [
      { icon: "🗓️", title: "Build your schedule", body: "Create practices, meets, and socials for your teams from the Events page." },
      { icon: "🔗", title: "Invite swimmers", body: "Generate single-use invite links (you choose how long they last) and share them with families." },
      { icon: "👥", title: "Manage your roster", body: "Track attendance, log times, and message your team in the monitored group chat." },
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

const AI_PROVIDERS: { id: AiProvider; label: string; free: boolean; keyUrl: string }[] = [
  { id: "groq", label: "Groq — free & fast (recommended)", free: true, keyUrl: "https://console.groq.com/keys" },
  { id: "claude", label: "Anthropic Claude — best quality (paid)", free: false, keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI GPT (paid)", free: false, keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Google Gemini (free tier)", free: true, keyUrl: "https://aistudio.google.com/app/apikey" },
];

type Step = ({ kind: "tour" } & TourStep) | { kind: "ai" } | { kind: "github" };

function buildSteps(role: Role): Step[] {
  const steps: Step[] = [];
  const tour = GUIDES[role];
  if (role !== "admin" && tour) {
    steps.push(...tour.steps.map((s) => ({ kind: "tour" as const, ...s })));
  }
  if (role === "coach" || role === "admin") steps.push({ kind: "ai" });
  steps.push({ kind: "github" }); // everyone gets the star ask at the end
  return steps;
}

export function WelcomeGuide() {
  const { firebaseUser, effectiveRole } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<AiProvider>(loadPreferences().preferredProvider ?? "groq");
  const [keyInput, setKeyInput] = useState("");

  const storageKey =
    firebaseUser && effectiveRole ? `swimware.welcome.${firebaseUser.uid}.${effectiveRole}` : null;
  const steps = useMemo(() => (effectiveRole ? buildSteps(effectiveRole) : []), [effectiveRole]);

  useEffect(() => {
    if (!storageKey || !effectiveRole || steps.length === 0) {
      setDismissed(true);
      return;
    }
    setStep(0);
    setKeyInput(getApiKey(provider));
    setDismissed(localStorage.getItem(storageKey) === "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, effectiveRole]);

  if (dismissed || steps.length === 0) return null;

  const cur = steps[step];
  const isLast = step === steps.length - 1;
  const providerMeta = AI_PROVIDERS.find((p) => p.id === provider)!;
  // AI step is required: must supply a key before advancing.
  const aiBlocked = cur.kind === "ai" && !keyInput.trim();

  function changeProvider(p: AiProvider) {
    setProvider(p);
    setKeyInput(getApiKey(p));
  }

  function advance() {
    if (cur.kind === "ai") {
      setApiKey(provider, keyInput.trim());
      savePreferences({ ...loadPreferences(), preferredProvider: provider });
    }
    if (isLast) finish();
    else setStep((s) => s + 1);
  }
  function finish() {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-heading">
      {/* Backdrop is intentionally non-dismissing — onboarding is required. */}
      <div className="welcome__backdrop" />
      <div className="welcome__card">
        {cur.kind === "tour" && (
          <>
            <h2 id="welcome-heading" className="welcome__heading">
              {GUIDES[effectiveRole!]?.heading}
            </h2>
            <div className="welcome__step">
              <div className="welcome__icon" aria-hidden="true">{cur.icon}</div>
              <h3>{cur.title}</h3>
              <p>{cur.body}</p>
            </div>
          </>
        )}

        {cur.kind === "ai" && (
          <>
            <h2 id="welcome-heading" className="welcome__heading">
              Set up your AI assistant ✨
            </h2>
            <div className="welcome__step welcome__step--form">
              <p className="muted">
                Pick a provider and paste your own API key — it’s stored only in this
                browser, never on our servers. <strong>Groq is free.</strong> A key is
                required to continue.
              </p>
              <div className="field">
                <label htmlFor="w-provider">Provider</label>
                <select
                  id="w-provider"
                  className="input"
                  value={provider}
                  onChange={(e) => changeProvider(e.target.value as AiProvider)}
                >
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="w-key">API key</label>
                <input
                  id="w-key"
                  type="password"
                  className="input"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Paste your key…"
                  autoComplete="off"
                />
              </div>
              <a className="link" href={providerMeta.keyUrl} target="_blank" rel="noreferrer">
                Get a {providerMeta.free ? "free " : ""}{providerMeta.label.split(" ")[0]} key ↗
              </a>
            </div>
          </>
        )}

        {cur.kind === "github" && (
          <>
            <h2 id="welcome-heading" className="welcome__heading">
              One more thing… 🥺
            </h2>
            <div className="welcome__step">
              <div className="welcome__icon" aria-hidden="true">⭐</div>
              <h3>Star us on GitHub?</h3>
              <p>
                This app is built with love for the team. If you like it, a star
                would mean the world to me 🥺
              </p>
              <a
                className="btn btn--primary"
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
                style={{ marginTop: ".75rem", display: "inline-block" }}
              >
                ⭐ Star on GitHub 🥺
              </a>
            </div>
          </>
        )}

        <div className="welcome__dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`welcome__dot${i === step ? " is-active" : ""}`} />
          ))}
        </div>

        <div className="welcome__actions">
          {step > 0 && (
            <button className="btn" onClick={() => setStep((s) => s - 1)}>Back</button>
          )}
          <button className="btn btn--primary" onClick={advance} disabled={aiBlocked}>
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
