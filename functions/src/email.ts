/**
 * Pluggable email interface.
 *
 * Firebase itself does not send arbitrary transactional email for free. The
 * cleanest *free-tier-friendly* option is the official "Trigger Email" extension
 * (firebase/firestore-send-email), which sends a message for every document you
 * write to a `mail` collection using your own SMTP credentials (e.g. a free
 * Gmail app password, Brevo/Sendinblue free tier, or Resend free tier).
 *
 * This module exposes ONE function — `sendEmail` — so the rest of the codebase
 * never cares which provider is wired up. The default implementation enqueues a
 * document in the `mail` collection (works with the Trigger Email extension). To
 * use a direct HTTP provider instead (Resend/SendGrid/Brevo), replace the body
 * of `sendEmail` with a fetch() call and read the API key from a secret param.
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  try {
    // --- Option A (default): Firestore "Trigger Email" extension ----------
    // Install: `firebase ext:install firebase/firestore-send-email`
    // It watches the `mail` collection and delivers via your SMTP config.
    await admin.firestore().collection("mail").add({
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      message: {
        subject: msg.subject,
        text: msg.text,
        html: msg.html ?? `<p>${escapeHtml(msg.text)}</p>`,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // --- Option B: direct HTTP provider (uncomment & supply a secret) ------
    // const RESEND_KEY = process.env.RESEND_API_KEY;
    // await fetch("https://api.resend.com/emails", {
    //   method: "POST",
    //   headers: {
    //     Authorization: `Bearer ${RESEND_KEY}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     from: "Mason Rec Rays <noreply@your-domain.dev>",
    //     to: msg.to,
    //     subject: msg.subject,
    //     text: msg.text,
    //     html: msg.html,
    //   }),
    // });
  } catch (err) {
    // Never let a notification failure break the primary action.
    logger.error("sendEmail failed", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
