export type AiProvider = "groq" | "openai" | "gemini" | "claude" | "web_scraper";

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiRequest {
  messages: ChatTurn[];
  /** Optional: a URL for the web-scraper provider to fetch and summarize. */
  url?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiResult {
  text: string;
  provider: AiProvider;
  model: string;
}

/** Non-secret AI preferences (safe to persist in Firestore aiSettings/{uid}). */
export interface AiPreferences {
  preferredProvider: AiProvider;
  model?: string;
  webScraperBaseUrl?: string;
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  groq: "llama-3.3-70b-versatile",
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
  claude: "claude-haiku-4-5-20251001",
  web_scraper: "summary",
};
