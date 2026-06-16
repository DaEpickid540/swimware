/**
 * AI Tools panel:
 *  - Provider + key management (keys live in localStorage only — see keyStore).
 *  - Coach/admin tasks: summarize week, draft announcement, review calendar URL.
 * Swimmer-limited tasks live on the swimmer dashboard.
 */
import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useQueryData } from "@/hooks/useCollection";
import type { SwimEvent } from "@/types/models";
import { Card, Spinner } from "@/components/ui";
import { GOMOTION_CALENDAR_URL } from "@/config/constants";
import { getApiKey, setApiKey } from "@/services/ai/keyStore";
import { loadPreferences, savePreferences } from "@/services/ai/aiClient";
import type { AiProvider } from "@/services/ai/types";
import { summarizeWeek, draftAnnouncement, reviewTeamCalendar } from "@/services/ai/prompts";

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: "groq", label: "Groq" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Google Gemini" },
  { id: "claude", label: "Anthropic Claude" },
  { id: "web_scraper", label: "Web scraper API" },
];

export default function AiTools() {
  const { role, assignedTeams } = useAuth();
  const isStaff = role === "admin" || role === "coach";

  const [prefs, setPrefs] = useState(loadPreferences());
  const [keyInput, setKeyInput] = useState(getApiKey(prefs.preferredProvider));
  const [scraperUrl, setScraperUrl] = useState(prefs.webScraperBaseUrl ?? "");
  const [bullets, setBullets] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const eventsQ = useMemo(
    () =>
      assignedTeams.length
        ? query(collection(db, "events"), where("teamId", "in", assignedTeams.slice(0, 10)))
        : null,
    [assignedTeams]
  );
  const { data: events } = useQueryData<SwimEvent>(eventsQ);

  function changeProvider(p: AiProvider) {
    const next = { ...prefs, preferredProvider: p };
    setPrefs(next);
    savePreferences(next);
    setKeyInput(getApiKey(p));
  }

  function persistSettings() {
    setApiKey(prefs.preferredProvider, keyInput);
    const next = { ...prefs, webScraperBaseUrl: scraperUrl };
    setPrefs(next);
    savePreferences(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function run(fn: () => Promise<{ text: string }>) {
    setBusy(true);
    setErr(null);
    setOut("");
    try {
      const res = await fn();
      setOut(res.text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">AI Tools</h1>

      <Card title="Your AI provider &amp; key" accent>
        <p className="muted">
          Keys are stored only in <strong>this browser</strong> and sent directly
          to your chosen provider — never to our servers or Firestore.
        </p>
        <div className="field">
          <label htmlFor="ai-provider">Provider</label>
          <select
            id="ai-provider"
            className="input"
            value={prefs.preferredProvider}
            onChange={(e) => changeProvider(e.target.value as AiProvider)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ai-key">API key</label>
          <input
            id="ai-key"
            type="password"
            className="input"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={prefs.preferredProvider === "web_scraper" ? "(optional)" : "sk-…"}
            autoComplete="off"
          />
        </div>
        {prefs.preferredProvider === "web_scraper" && (
          <div className="field">
            <label htmlFor="ai-scraper">Web scraper base URL</label>
            <input
              id="ai-scraper"
              className="input"
              value={scraperUrl}
              onChange={(e) => setScraperUrl(e.target.value)}
              placeholder="https://your-scraper.example.com/summarize"
            />
          </div>
        )}
        <button className="btn btn--primary" onClick={persistSettings}>
          Save settings
        </button>
        {saved && <span className="saved-pill" role="status"> Saved ✓</span>}
      </Card>

      {isStaff && (
        <>
          <Card title="Summarize my upcoming week">
            <button className="btn" disabled={busy} onClick={() => run(() => summarizeWeek(events))}>
              Generate summary
            </button>
          </Card>

          <Card title="Draft a team announcement">
            <div className="field">
              <label htmlFor="ai-bullets">Bullet points</label>
              <textarea
                id="ai-bullets"
                className="input"
                rows={4}
                value={bullets}
                onChange={(e) => setBullets(e.target.value)}
                placeholder="• Practice moved to 6pm&#10;• Bring caps for the meet"
              />
            </div>
            <button className="btn" disabled={busy || !bullets.trim()} onClick={() => run(() => draftAnnouncement(bullets))}>
              Draft it
            </button>
          </Card>

          <Card title="Review the team calendar">
            <p className="muted">
              Sends the GoMotion calendar URL to your configured web-scraper
              provider for summary.{" "}
              <a className="link" href={GOMOTION_CALENDAR_URL} target="_blank" rel="noreferrer">
                Open calendar ↗
              </a>
            </p>
            <button className="btn" disabled={busy} onClick={() => run(() => reviewTeamCalendar())}>
              Review calendar
            </button>
          </Card>
        </>
      )}

      {busy && <Spinner label="Contacting AI provider…" />}
      {err && <p className="form-error" role="alert">{err}</p>}
      {out && (
        <Card title="Result">
          <p className="ai-output" aria-live="polite" style={{ whiteSpace: "pre-wrap" }}>
            {out}
          </p>
        </Card>
      )}
    </div>
  );
}
