/**
 * Pre-built, safety-scoped AI tasks. Swimmer-facing tasks use a constrained
 * system prompt so the model cannot be steered into unsafe territory and never
 * gives medical/sensitive advice.
 */

import type { SwimEvent, Attendance } from "@/types/models";
import { runAi } from "./aiClient";
import { GOMOTION_CALENDAR_URL } from "@/config/constants";

const SWIMMER_GUARDRAIL =
  "You are a friendly assistant for a youth swim team. Keep responses short, " +
  "positive, age-appropriate, and strictly about practice logistics or " +
  "encouragement. Never give medical, dietary, or safety advice. Never request " +
  "personal information. If asked anything off-topic, gently redirect to swim practice.";

function fmtEvents(events: SwimEvent[]): string {
  return events
    .map((e) => {
      const start = typeof e.startTime === "number" ? new Date(e.startTime) : null;
      return `- ${e.title} (${e.type})${start ? ` on ${start.toLocaleString()}` : ""}${
        e.location ? ` @ ${e.location}` : ""
      }`;
    })
    .join("\n");
}

/** Coach/admin: summarize the upcoming week from structured event data. */
export function summarizeWeek(events: SwimEvent[]) {
  return runAi({
    messages: [
      { role: "system", content: "You summarize a swim coach's week clearly and concisely." },
      {
        role: "user",
        content: `Summarize my upcoming week in a short paragraph plus a bullet list of key sessions:\n${fmtEvents(events)}`,
      },
    ],
  });
}

/** Coach/admin: turn bullet points into a polished announcement. */
export function draftAnnouncement(bullets: string) {
  return runAi({
    messages: [
      { role: "system", content: "You write warm, clear announcements for a swim team's families." },
      { role: "user", content: `Draft a polished team announcement from these points:\n${bullets}` },
    ],
  });
}

/** Coach/admin: analyze attendance trends from aggregated data. */
export function analyzeAttendance(rows: Attendance[]) {
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  return runAi({
    messages: [
      { role: "system", content: "You are an analytics assistant for a swim coach." },
      {
        role: "user",
        content: `Given these attendance totals ${JSON.stringify(
          counts
        )} across ${rows.length} records, give 3 short insights and one suggestion.`,
      },
    ],
  });
}

/** Swimmer (limited): explain their schedule in simple language. */
export function explainSchedule(events: SwimEvent[]) {
  return runAi({
    messages: [
      { role: "system", content: SWIMMER_GUARDRAIL },
      { role: "user", content: `Explain my upcoming swim schedule simply:\n${fmtEvents(events)}` },
    ],
  });
}

/** Swimmer (limited): short, safe motivational note. */
export function motivationalMessage(recentSummary: string) {
  return runAi({
    messages: [
      { role: "system", content: SWIMMER_GUARDRAIL },
      { role: "user", content: `Write a 2-sentence encouraging note. Context: ${recentSummary}` },
    ],
  });
}

/** Coach/admin: ask the web-scraper provider to review the team calendar URL. */
export function reviewTeamCalendar(url: string = GOMOTION_CALENDAR_URL) {
  return runAi(
    {
      url,
      messages: [
        { role: "system", content: "You extract and summarize swim team calendar info." },
        { role: "user", content: "Review this team calendar and list upcoming meets and key dates." },
      ],
    },
    { preferredProvider: "web_scraper" }
  );
}
