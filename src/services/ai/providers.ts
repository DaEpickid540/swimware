/**
 * Provider adapters. Each adapter takes a normalized AiRequest + API key and
 * returns plain text. Keys are passed in by the caller (from keyStore) and are
 * never logged. All calls go browser -> provider directly.
 */

import type { AiRequest, AiResult, ChatTurn } from "./types";

function lastUserText(messages: ChatTurn[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
}

// ---- Groq (OpenAI-compatible) --------------------------------------------
export async function callGroq(req: AiRequest, apiKey: string, model: string): Promise<AiResult> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.5,
      max_tokens: req.maxTokens ?? 800,
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", provider: "groq", model };
}

// ---- OpenAI ---------------------------------------------------------------
export async function callOpenAi(req: AiRequest, apiKey: string, model: string): Promise<AiResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.5,
      max_tokens: req.maxTokens ?? 800,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", provider: "openai", model };
}

// ---- Google Gemini --------------------------------------------------------
export async function callGemini(req: AiRequest, apiKey: string, model: string): Promise<AiResult> {
  const sys = req.messages.find((m) => m.role === "system")?.content;
  const contents = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
        generationConfig: { temperature: req.temperature ?? 0.5, maxOutputTokens: req.maxTokens ?? 800 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text: string }) => p.text).join("") ?? "";
  return { text, provider: "gemini", model };
}

// ---- Anthropic Claude -----------------------------------------------------
export async function callClaude(req: AiRequest, apiKey: string, model: string): Promise<AiResult> {
  const system = req.messages.find((m) => m.role === "system")?.content;
  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Required for browser-origin calls to Anthropic.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      system,
      messages,
      max_tokens: req.maxTokens ?? 800,
      temperature: req.temperature ?? 0.5,
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
  return { text, provider: "claude", model };
}

// ---- Web scraper provider -------------------------------------------------
// Generic HTTP endpoint the user configures (baseUrl). We POST { url, prompt }
// and expect { summary | text } back. Used for "review the team calendar".
export async function callWebScraper(
  req: AiRequest,
  apiKey: string,
  baseUrl: string
): Promise<AiResult> {
  if (!baseUrl) throw new Error("No web-scraper base URL configured.");
  if (!req.url) throw new Error("No URL provided to summarize.");
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ url: req.url, prompt: lastUserText(req.messages) }),
  });
  if (!res.ok) throw new Error(`Web scraper error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.summary ?? data.text ?? JSON.stringify(data), provider: "web_scraper", model: "summary" };
}
