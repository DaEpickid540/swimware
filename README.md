# 🐟 Mason Rec Rays — Swim Team Hub

A secure, accessible, production-leaning **Firebase + React + TypeScript** web app
for a swim club, with three roles (admin / coach / swimmer), invite-only swimmer
onboarding, team chat, events & RSVPs, news, performance & attendance, and
user-supplied AI tools.

> **Runs entirely on the free Spark plan — no Cloud Functions required.** Roles
> live in `users/{uid}.role` and are enforced by **Firestore security rules**:
> admins are gated to a hard-coded email allow-list, coaches are admin-approved,
> and swimmers can join **only by redeeming a single-use, expiring invite token**
> (validated atomically in the rules via a write batch). **AI API keys never
> leave the browser.** Cloud Functions are included but **optional** (email / FCM
> fan-out) and only needed if you later upgrade to Blaze.

---

## Table of contents
1. [Tech stack](#tech-stack)
2. [Project structure](#project-structure)
3. [How it works (key flows)](#how-it-works-key-flows)
4. [Local setup](#local-setup)
5. [Environment variables](#environment-variables)
6. [Deploy to Firebase](#deploy-to-firebase)
7. [Plugging in email & push notifications](#plugging-in-email--push-notifications)
8. [AI providers & keys](#ai-providers--keys)
9. [Security model](#security-model)
10. [Data model](#data-model)
11. [What's scaffolded vs. fully wired](#status)

---

## Tech stack
- **React 18 + TypeScript + Vite** front-end (mobile-first, ARIA-compliant).
- **Firebase**: Auth, Firestore, Storage, Cloud Functions (gen-2 + one gen-1 auth
  trigger), Hosting. FCM hooks documented.
- No CSS framework — a custom **CSS-variable theme system** (light / dark /
  high-contrast).

## Project structure
```
swimware/
├── firebase.json            # Hosting / Firestore / Storage / Functions / emulators
├── firestore.rules          # Role-based security rules (heavily commented)
├── firestore.indexes.json   # Composite indexes for the app's queries
├── storage.rules            # Storage access rules
├── .env.example             # Client Firebase config (copy to .env)
├── functions/               # Cloud Functions (Admin SDK)
│   └── src/
│       ├── index.ts         # admin bootstrap, invites, roles, audit, fan-out
│       ├── config.ts        # hard-coded admin emails (server-side only)
│       └── email.ts         # pluggable email interface
└── src/
    ├── main.tsx             # entry + offline persistence
    ├── App.tsx              # routes + role-based redirects
    ├── config/constants.ts  # app constants, GoMotion reference URL, legal versions
    ├── types/models.ts      # Firestore document types
    ├── services/
    │   ├── firebase.ts      # Firebase init (+ emulator wiring)
    │   ├── functions.ts     # typed callable wrappers
    │   ├── csv.ts           # client-side CSV export
    │   └── ai/              # provider-agnostic AI client
    │       ├── aiClient.ts  # runAi() switcher + preferences
    │       ├── providers.ts # Groq / OpenAI / Gemini / Claude / web-scraper
    │       ├── keyStore.ts  # localStorage-only key storage
    │       ├── prompts.ts   # safety-scoped task prompts
    │       └── types.ts
    ├── context/             # AuthContext (claims-based role), ThemeContext
    ├── hooks/useCollection.ts  # real-time onSnapshot helper
    ├── components/          # Layout, ProtectedRoute, ChatRoom, ui primitives
    ├── pages/               # dashboards, events, chat, news, roster, AI, settings…
    └── styles/global.css    # theme + all component styles
```

## How it works (key flows)

**Login & role routing** — `AuthContext` reads the ID token's custom claims to
get `role` + `assignedTeams`. `App.tsx`'s `/` route redirects to the right
dashboard. `ProtectedRoute` is a UX gate; Firestore rules are the real gate.

**Admin bootstrap** — on sign-in, `provisionOnSignIn()` writes the user's own
`users/{uid}` doc with role `admin` *iff* their email is in the allow-list; the
Firestore rule permits this only for allow-listed emails, so it can't be forged.

**Invite-only swimmer onboarding**
1. Coach clicks *Generate invite link* → `createInviteToken()` writes a
   single-use, 7-day token (doc id = 32-byte Web-Crypto bearer secret); rules
   require the caller to coach that team.
2. Swimmer opens `/invite/:token`, fills the form, accepts consents, and creates
   an Auth account (no role yet — rules deny everything).
3. Client `acceptInvite()` runs a **write batch**: create swimmer doc + flip the
   token `used` + add to roster. Rules reject it unless the token is valid and
   unused, so the token is single-use and no other path creates a swimmer.

## Local setup
```bash
# 1. Install
npm install
npm --prefix functions install

# 2. Configure client env
cp .env.example .env      # then fill in your Firebase web config

# 3a. Run against the live project
npm run dev

# 3b. …or run fully offline against emulators
#     set VITE_USE_EMULATORS=true in .env, then:
npm run emulators         # in one terminal (Auth/Firestore/Functions/Storage)
npm run dev               # in another
```
Requires Node 20+ and the Firebase CLI: `npm i -g firebase-tools` then
`firebase login` and `firebase use <your-project-id>` (update `.firebaserc`).

## Environment variables
All client vars are **public by design** (they identify the project, not grant
access). See `.env.example`. The only secret-bearing config is **server-side**:

- **Admin emails** — `functions/src/config.ts` falls back to the two bootstrap
  emails; override without code via `ADMIN_EMAILS="a@x.com,b@y.com"` (functions
  env / `.env` in `functions/`).
- **Email provider creds** — supplied to the Trigger Email extension or via a
  Functions secret (see below). Never in client code.

## Deploy to Firebase
```bash
firebase login
firebase use <your-project-id>

# One-shot full deploy (build web + functions, push rules + hosting):
npm run deploy            # == npm run build && firebase deploy

# Or piecemeal:
npm run deploy:rules      # firestore + storage rules
npm run functions:deploy  # cloud functions
npm run deploy:hosting    # built SPA to Hosting
```
`firebase.json` already wires SPA rewrites, long-cache headers for hashed assets,
and the functions predeploy build step.

## Plugging in email & push notifications

**Email** is fully abstracted behind `functions/src/email.ts` → `sendEmail()`.
The default implementation enqueues a doc in the `mail` collection, which the
free **Firebase "Trigger Email" extension** delivers via your own SMTP (a free
Gmail app password, Brevo, or Resend free tier all work):
```bash
firebase ext:install firebase/firestore-send-email
```
To use a direct HTTP provider instead (Resend/SendGrid), uncomment **Option B**
in `email.ts` and add the API key as a secret:
```bash
firebase functions:secrets:set RESEND_API_KEY
```
Already wired to fire on: swimmer registration (notifies coach) and RSVP→"going".

**Push (FCM)** — the in-app **notifications** collection + fan-out
(`onNewsCreated`) works today with no extra setup. For real web push, add a
`firebase-messaging-sw.js`, request a token with your `VITE_FIREBASE_VAPID_KEY`,
store it on the user doc, and send via the Admin SDK inside `onNewsCreated`.
That's the single integration point; everything else is in place.

## AI providers & keys
`src/services/ai/` is provider-agnostic: the app calls `runAi(request)` and the
switcher dispatches to Groq, OpenAI, Gemini, Claude, or a generic **web-scraper
API**. Switching providers is a one-line preference change in the AI Tools panel.

**Keys are stored only in `localStorage`** (`keyStore.ts`) and sent **directly
from the browser to the chosen provider** — never to Firestore or our servers.
This is appropriate for a personal pasted key but is *not* a secret manager; for
a hardened deployment, proxy AI calls through a Cloud Function backed by Secret
Manager and delete `keyStore.ts`. This tradeoff is intentional and called out in
the code.

The GoMotion calendar URL is wired as a **reference** only (`constants.ts`); the
"Review the team calendar" tool passes it to the user's web-scraper provider — the
app never scrapes it directly.

## Security model (no Cloud Functions)
- **Roles** = `users/{uid}.role`, read in rules via `get()`. Each role can only
  be obtained through a rule-gated path, so the client cannot escalate:
  - **admin** — a user may set their *own* role to `admin` only if their email is
    in the hard-coded allow-list in `firestore.rules` (and mirrored in
    `src/services/onboarding.ts`).
  - **coach** — granted by an admin via `pendingUsers` pre-registration or by
    approving an `accessRequests` entry. Coaches never self-promote.
  - **swimmer** — created only in the same write batch that redeems a valid,
    unused, unexpired `inviteTokens` doc (cross-doc `get()` check). The token
    flips `used:false→true`, so replays fail — single use enforced by rules.
- **Default-deny**; every collection is scoped by role and `assignedTeams`.
- **Storage rules** read the same role doc cross-service via `firestore.get()`.
- **Audit log** (`auditLogs`) is append-only (no client edits/deletes),
  admin-readable; the app appends entries for role changes, invites, etc.
- **Consent/waivers** are versioned; bumping a version forces re-acceptance.

> The `functions/` directory (Admin-SDK version of these flows + email/FCM
> fan-out) is retained for teams that upgrade to **Blaze**, but the app does not
> depend on it.

## Data model
See `src/types/models.ts` for the full typed schema:
`users, teams, events, signups, inviteTokens, chats/{id}/messages, news,
aiSettings, performanceLogs, attendance, timeStandards, goals, documents,
notifications, settings, auditLogs`.

## Status

**Fully wired end-to-end (UI + Firestore + rules + functions):** auth & role
routing, admin user management (promote/demote/deactivate), invite generation &
redemption, events + RSVP + create, team chat with moderation, news feed,
roster + CSV export, AI tools (all 5 providers + 6 task prompts), theme system,
audit logging, offline persistence, consent capture.

**Scaffolded with clear extension points (data model, rules, and types exist;
some richer UI is intentionally minimal in this starter):** month-grid calendar
(list view is the accessible default over the same data), attendance/performance
*entry* UIs (read views + schema/rules are in place), time-standards & goals
screens, document upload UI (Storage rules + `documents` collection ready),
in-app notifications panel (collection + fan-out live), and FCM web push (single
documented integration point).

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
