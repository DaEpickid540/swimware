// Firestore rules tests: parent/coach/admin provisioning, guardian links,
// display names and chat sender labels.
// Run: cd test/rules && npm install && npm test   (needs firebase-tools + Java)
import test, { before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, writeBatch, arrayUnion, serverTimestamp, deleteField, Timestamp,
} from 'firebase/firestore';

let env;
const NOW = Date.now();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-swimware',
    firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8182 },
  });
});
after(() => env.cleanup());

// Seed: team T1 (swimmer S1 on it, coach C1), team T2 (secret), chat for each.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teams/T1'), { name: 'T1', swimmers: ['S1'] });
    await setDoc(doc(db, 'teams/T2'), { name: 'T2', swimmers: [] });
    await setDoc(doc(db, 'chats/T1'), { type: 'team_chat', teamId: 'T1' });
    await setDoc(doc(db, 'chats/T2'), { type: 'team_chat', teamId: 'T2' });
    await setDoc(doc(db, 'users/S1'), { role: 'swimmer', email: 's1@x.com', displayName: 'Sam Swimmer', assignedTeams: ['T1'], linkedParentEmail: 'mom@x.com', active: true });
    await setDoc(doc(db, 'users/C1'), { role: 'coach', email: 'coach@x.com', displayName: 'Coach Kim', assignedTeams: ['T1'], active: true });
    await setDoc(doc(db, 'parentLinks/mom@x_com'), { parentEmail: 'mom@x.com', swimmerIds: ['S1'], teamIds: ['T1'] });
    await setDoc(doc(db, 'inviteTokens/TOK1'), { teamId: 'T1', used: false, expiresAt: NOW + 3600e3, parentEmail: 'dad@x.com' });
    await setDoc(doc(db, 'pendingUsers/newcoach@x_com'), { role: 'coach', email: 'newcoach@x.com' });
  });
});

const ctx = (uid, email, verified = true) =>
  env.authenticatedContext(uid, email ? { email, email_verified: verified } : {}).firestore();

const parentDoc = (email, teams, swimmers) => ({
  role: 'parent', email, displayName: 'Pat Parent', assignedTeams: teams, linkedSwimmers: swimmers,
  active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});

// ── The reported exploit ─────────────────────────────────────────────────────
test('stranger cannot forge a parent link for their own email', async () => {
  const db = ctx('X', 'stranger@x.com');
  await assertFails(setDoc(doc(db, 'parentLinks/stranger@x_com'), { parentEmail: 'stranger@x.com', swimmerIds: ['X'], teamIds: ['T2'] }));
});

test('parent cannot pick their own teams; they come from the link', async () => {
  const db = ctx('P1', 'mom@x.com');
  await assertFails(setDoc(doc(db, 'users/P1'), parentDoc('mom@x.com', ['T1', 'T2'], ['S1'])));
  await assertFails(setDoc(doc(db, 'users/P1'), { ...parentDoc('mom@x.com', ['T1'], ['S1']), consents: {} }));
  await assertSucceeds(setDoc(doc(db, 'users/P1'), parentDoc('mom@x.com', ['T1'], ['S1'])));
});

test('legit parent can still read their swimmer and team chat, but not post', async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'users/P1'), parentDoc('mom@x.com', ['T1'], ['S1'])));
  const db = ctx('P1', 'mom@x.com');
  await assertSucceeds(getDoc(doc(db, 'users/S1')));
  await assertSucceeds(getDoc(doc(db, 'chats/T1')));
  await assertFails(getDoc(doc(db, 'chats/T2')));
  await assertFails(addDoc(collection(db, 'chats/T1/messages'), { senderId: 'P1', senderName: 'Pat Parent', senderRole: 'parent', text: 'hi', createdAt: serverTimestamp() }));
});

// ── Unverified emails (password sign-ups) ────────────────────────────────────
test('unverified email cannot claim admin, a pending coach slot, or a parent link', async () => {
  const admin = ctx('A1', 'daepickid540@gmail.com', false);
  await assertFails(setDoc(doc(admin, 'users/A1'), { role: 'admin', email: 'daepickid540@gmail.com', displayName: 'Admin', assignedTeams: [], active: true }));
  const coach = ctx('C2', 'newcoach@x.com', false);
  await assertFails(setDoc(doc(coach, 'users/C2'), { role: 'coach', email: 'newcoach@x.com', displayName: 'Coach New', assignedTeams: [], active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  const parent = ctx('P1', 'mom@x.com', false);
  await assertFails(setDoc(doc(parent, 'users/P1'), parentDoc('mom@x.com', ['T1'], ['S1'])));
  await assertFails(getDoc(doc(parent, 'parentLinks/mom@x_com')));
});

test('verified admin email still bootstraps', async () => {
  const db = ctx('A1', 'daepickid540@gmail.com', true);
  await assertSucceeds(setDoc(doc(db, 'users/A1'), { role: 'admin', email: 'daepickid540@gmail.com', displayName: 'Administrator', assignedTeams: [], active: true }));
});

test('pending coach starts with no teams', async () => {
  const db = ctx('C2', 'newcoach@x.com');
  const base = { role: 'coach', email: 'newcoach@x.com', displayName: 'Coach New', active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'users/C2'), { ...base, assignedTeams: ['T2'] }));
  await assertSucceeds(setDoc(doc(db, 'users/C2'), { ...base, assignedTeams: [] }));
});

// ── Invite redemption still works end to end ─────────────────────────────────
test('swimmer invite batch (users + token + team + parent link) succeeds', async () => {
  const db = ctx('S2', 'kid@x.com', false); // swimmers don't need a verified email
  const b = writeBatch(db);
  b.set(doc(db, 'users/S2'), {
    role: 'swimmer', email: 'kid@x.com', displayName: 'Kid Swimmer', linkedParentEmail: 'Dad@x.com',
    assignedTeams: ['T1'], invitedVia: 'TOK1', active: true, consents: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  b.update(doc(db, 'inviteTokens/TOK1'), { used: true, usedBy: 'S2', usedAt: serverTimestamp() });
  b.update(doc(db, 'teams/T1'), { swimmers: arrayUnion('S2') });
  b.set(doc(db, 'parentLinks/dad@x_com'), { parentEmail: 'dad@x.com', swimmerIds: arrayUnion('S2'), teamIds: arrayUnion('T1'), updatedAt: serverTimestamp() }, { merge: true });
  await assertSucceeds(b.commit());
});

test('swimmer cannot add other teams or other uids to a link', async () => {
  const db = ctx('S1', 's1@x.com');
  await assertFails(setDoc(doc(db, 'parentLinks/mom@x_com'), { teamIds: arrayUnion('T2') }, { merge: true }));
  await assertFails(setDoc(doc(db, 'parentLinks/mom@x_com'), { swimmerIds: arrayUnion('S9') }, { merge: true }));
  await assertFails(setDoc(doc(db, 'parentLinks/evil@x_com'), { parentEmail: 'evil@x.com', swimmerIds: ['S1'], teamIds: ['T1'] }));
  await assertSucceeds(setDoc(doc(db, 'parentLinks/mom@x_com'), { swimmerIds: arrayUnion('S1'), teamIds: arrayUnion('T1') }, { merge: true }));
});

// ── Self-updates ─────────────────────────────────────────────────────────────
test('banned user cannot delete `active` to unban themselves', async () => {
  await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'users/S1'), { active: false }));
  await assertFails(updateDoc(doc(ctx('S1', 's1@x.com'), 'users/S1'), { active: deleteField() }));
});

test('swimmer cannot rename to a staff title or re-point their guardian', async () => {
  const db = ctx('S1', 's1@x.com');
  await assertFails(updateDoc(doc(db, 'users/S1'), { displayName: 'Coach Mike' }));
  await assertFails(updateDoc(doc(db, 'users/S1'), { displayName: '<img src=x onerror=alert(1)>' }));
  await assertFails(updateDoc(doc(db, 'users/S1'), { linkedParentEmail: 'stranger@x.com' }));
  await assertSucceeds(updateDoc(doc(db, 'users/S1'), { displayName: 'Samantha Swimmer', phone: '555' }));
  await assertSucceeds(updateDoc(doc(db, 'users/S1'), { displayName: 'Stafford Smith' })); // "staff" inside a word is fine
});

test('coaches may use a staff title', async () => {
  await assertSucceeds(updateDoc(doc(ctx('C1', 'coach@x.com'), 'users/C1'), { displayName: 'Coach Kim Lee' }));
});

// ── Chat sender labels ───────────────────────────────────────────────────────
test('chat sender name/role must match the sender profile', async () => {
  const db = ctx('S1', 's1@x.com');
  const msgs = collection(db, 'chats/T1/messages');
  const base = { senderId: 'S1', text: 'hello', createdAt: serverTimestamp() };
  await assertFails(addDoc(msgs, { ...base, senderName: 'Coach Kim', senderRole: 'swimmer' }));
  await assertFails(addDoc(msgs, { ...base, senderName: 'Sam Swimmer', senderRole: 'coach' }));
  await assertFails(addDoc(msgs, { ...base, senderName: 'Sam Swimmer' }));                       // missing role
  await assertSucceeds(addDoc(msgs, { ...base, senderName: 'Sam Swimmer', senderRole: 'swimmer' }));
});

test('authors can edit text but not re-label a message', async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'chats/T1/messages/m1'), { senderId: 'S1', senderName: 'Sam Swimmer', senderRole: 'swimmer', text: 'hi' }));
  const db = ctx('S1', 's1@x.com');
  await assertFails(updateDoc(doc(db, 'chats/T1/messages/m1'), { senderName: 'Coach Kim' }));
  await assertSucceeds(updateDoc(doc(db, 'chats/T1/messages/m1'), { text: 'hi!' }));
});

// ── Audit log ────────────────────────────────────────────────────────────────
test('audit entries need the fixed shape and a server timestamp', async () => {
  const db = ctx('S1', 's1@x.com');
  await assertFails(addDoc(collection(db, 'auditLogs'), { actorId: 'S1', actorEmail: 's1@x.com', action: 'x', at: Timestamp.fromMillis(0) }));
  await assertFails(addDoc(collection(db, 'auditLogs'), { actorId: 'S1', actorEmail: 'admin@x.com', action: 'x', at: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(db, 'auditLogs'), { actorId: 'S1', actorEmail: 's1@x.com', action: 'invite.accept', target: 'TOK1', details: null, at: serverTimestamp() }));
});
