# Youth-Safety, Privacy & Cost Compliance

> **Not legal advice.** This document describes the youth-safety and
> data-minimization *controls implemented in the software*. It is written by an
> engineer, not an attorney. Actual legal compliance (Ohio Rev. Code §2907,
> COPPA, FERPA-adjacent expectations, Ohio youth-sports rules) also depends on
> **operational policies** that are not code — background checks, mandated-reporter
> training, a lawyer-reviewed privacy policy and waiver, records-retention rules,
> and an abuse-reporting process. **Have qualified counsel review before
> production use with real minors.**

---

## 1. Free-tier / cost posture

| Concern | Status |
|---|---|
| Firebase plan | Runs **entirely on the free Spark plan**. No Cloud Functions required (roles/invites/onboarding are client writes gated by security rules). |
| Firestore reads/writes | Queries are bounded (`limit()`), team-scoped, and real-time listeners are scoped to the signed-in user's teams. Offline persistence reduces repeat reads. |
| Storage | Optional; not required for core use. Tight per-path size caps in `storage.rules`. |
| Email | **No paid email by default.** Free alternatives ship: in-app **notifications** + a **“Copy parent email” template** button on the roster (copies recipients + body to the clipboard to paste into your own mail client). |
| AI keys | **User-supplied only**, stored in `localStorage`, sent browser→provider. No shared/hidden keys, no server-side paid usage. |

### Paid (Blaze) features — gated + labeled
- The only Blaze-dependent feature (server-sent **email notifications**) is an
  **admin toggle in Settings → Paid (Blaze) features**, **OFF by default**, with a
  cost warning and a description of the free alternative used when off.
- The app is fully usable with every Blaze feature OFF — no broken pages.

### AI provider transparency (paid APIs allowed, never blocked)
- A persistent **cost warning** appears in AI Tools.
- **Groq** is recommended as the best **free-tier** option (fast, generous free tier).
- **Anthropic Claude** is recommended as the **best quality / safest** option (pay-per-token; check pricing).
- Each provider shows an inline note + a “Free tier / May incur costs” flag.
- Keys are never stored in plaintext on a server or in Firestore; the UI warns
  against pasting keys on shared machines.

---

## 2. Youth-safety controls (Ohio §2907-aligned design)

| Requirement | How the app enforces it |
|---|---|
| **No adult→minor private messaging** | The **only** chat that can exist is one canonical **group** chat per team (`chat` doc id must equal `teamId`, `type` fixed to `team_chat`). Security rules reject any other chat shape, so there is **no data path** to create a 1:1 / private channel. |
| **All communication group-based & monitored** | Every message is visible to the whole team and to coaches/admins (moderation: delete/mute). A visible notice states this in the chat UI. |
| **Parent/guardian visibility** | The swimmer account is **parent-managed** (parent completes registration & co-manages). Messages are readable from the swimmer's account, so a guardian can review them. A guardian email is captured and stored. |
| **Invite-only swimmer accounts** | No public swimmer sign-up exists anywhere. A swimmer doc can only be created by **redeeming a valid, unused, unexpired invite token**, enforced atomically in the rules (single-use). |
| **No public sign-ups** | The login page offers only sign-in + (admin-approved) coach accounts. Swimmers must use a coach-generated invite link. |
| **Minimize exposure of minors' data** | A coach can read a user's profile (age, parent/emergency contacts, medical notes) **only if they share a team**; cross-team reads are denied. Admins see all; swimmers see only themselves. Signups & attendance are team-scoped for coaches. |
| **No unsafe AI for minors** | AI tools and **API-key entry are staff-only (adults)**. Swimmers have no AI features and never send data to third-party AI providers. |
| **Parental consent (COPPA)** | Registration requires an explicit **parent/guardian consent** checkbox in addition to terms/privacy/waiver; the accepted versions + timestamps are stored on the swimmer doc. Bumping a version forces re-acceptance. |
| **Medical data minimization** | The medical field is labeled “non-sensitive only — no diagnoses”, restricted to staff-on-team + admin. |
| **Tamper-resistant roles** | Roles live in `users/{uid}.role`; admin is gated to a hard-coded email allow-list, coaches are admin-approved, swimmers come only from invites. Default-deny on everything else. |
| **Audit trail** | `auditLogs` is append-only (no edits/deletes), admin-readable; role changes, invites, and de/activations are logged. |

---

## 3. Known limitations / operational follow-ups (NOT code)

These are required for real-world compliance but must be handled by the program,
not the app:

1. **Dedicated parent accounts** — today guardians review via the swimmer's
   account. A separate read-only **parent role** (linked to a swimmer) would be a
   stronger control; it's a designed-but-unbuilt enhancement.
2. **Lawyer-reviewed legal text** — the in-app terms/privacy/waiver/consent copy
   are placeholders. Replace with counsel-approved text (editable in admin Settings).
3. **Background checks & mandated-reporter training** for all coaches/admins.
4. **Abuse / safety reporting path** (e.g., a “report a message” action routed to
   admins) — recommended next addition.
5. **Data retention & deletion policy** — implement a documented retention window
   and a guardian data-deletion request workflow.
6. **Two-coach rule / no 1:1 in person** — an operational policy beyond software.

---

## 4. Auto-audit checklist (re-run after each change)

- [ ] No collection allows creating a non-`team_chat` chat.
- [ ] No UI exposes AI key entry to a `swimmer`.
- [ ] Swimmer creation still requires a valid invite token (rules).
- [ ] Coach reads of `users`/`signups`/`attendance` remain team-scoped.
- [ ] All Blaze features remain admin-toggleable and OFF by default.
- [ ] AI panel still shows the cost warning + Groq/Claude recommendations.
- [ ] No public swimmer sign-up route exists.
