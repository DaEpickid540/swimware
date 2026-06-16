/**
 * Provider-agnostic AI client. The rest of the app calls `runAi()` and never
 * touches a specific vendor. Switching providers is a one-line preference
 * change. Keys come from keyStore (localStorage, user-supplied).
 */

import type { AiProvider, AiRequest, AiResult, AiPreferences } from "./types";
import { DEFAULT_MODELS } from "./types";
import { getApiKey } from "./keyStore";
import { callGroq, callOpenAi, callGemini, callClaude, callWebScraper } from "./providers";

const PREFS_KEY = "swimware.aiprefs";

export function loadPreferences(): AiPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as AiPreferences;
  } catch {
    /* ignore corrupt prefs */
  }
  return { preferredProvider: "groq" };
}

export function savePreferences(prefs: AiPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export class MissingKeyError extends Error {
  constructor(public provider: AiProvider) {
    super(`No API key configured for "${provider}". Add one in AI Settings.`);
    this.name = "MissingKeyError";
  }
}

export async function runAi(req: AiRequest, override?: Partial<AiPreferences>): Promise<AiResult> {
  const prefs = { ...loadPreferences(), ...override };
  const provider = prefs.preferredProvider;
  const model = prefs.model || DEFAULT_MODELS[provider];
  const key = getApiKey(provider);

  // Web scraper may use an unauthenticated endpoint; all others require a key.
  if (provider !== "web_scraper" && !key) throw new MissingKeyError(provider);

  switch (provider) {
    case "groq":
      return callGroq(req, key, model);
    case "openai":
      return callOpenAi(req, key, model);
    case "gemini":
      return callGemini(req, key, model);
    case "claude":
      return callClaude(req, key, model);
    case "web_scraper":
      return callWebScraper(req, key, prefs.webScraperBaseUrl ?? "");
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
