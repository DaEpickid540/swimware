import { readFileSync } from 'node:fs';
import { before, after, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'swimware-rules-audit',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seedUser(uid, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), data);
  });
}

describe('storage: team-docs — team scoping', () => {
  it('BLOCKS a swimmer NOT on the team from reading team-docs', async () => {
    await seedUser('swimmerA', {
      role: 'swimmer',
      email: 'a@example.com',
      assignedTeams: ['teamA'],
      active: true,
    });
    const ctx = testEnv.authenticatedContext('swimmerA', { email: 'a@example.com' });
    await assertFails(getBytes(ref(ctx.storage(), 'team-docs/teamB/roster.pdf')));
  });

  it('BLOCKS a non-staff team member from WRITING a team-doc', async () => {
    await seedUser('swimmerA', {
      role: 'swimmer',
      email: 'a@example.com',
      assignedTeams: ['teamA'],
      active: true,
    });
    const ctx = testEnv.authenticatedContext('swimmerA', { email: 'a@example.com' });
    const bytes = new Uint8Array([1, 2, 3]);
    await assertFails(uploadBytes(ref(ctx.storage(), 'team-docs/teamA/notes.pdf'), bytes));
  });
});

describe('storage: user-uploads — own-file scoping', () => {
  it('BLOCKS reading another user\'s upload folder', async () => {
    await seedUser('userA', { role: 'swimmer', email: 'a@example.com', active: true });
    const ctx = testEnv.authenticatedContext('userA', { email: 'a@example.com' });
    await assertFails(getBytes(ref(ctx.storage(), 'user-uploads/userB/avatar.png')));
  });

  it('BLOCKS writing into another user\'s upload folder', async () => {
    await seedUser('userA', { role: 'swimmer', email: 'a@example.com', active: true });
    const ctx = testEnv.authenticatedContext('userA', { email: 'a@example.com' });
    const bytes = new Uint8Array([1, 2, 3]);
    await assertFails(uploadBytes(ref(ctx.storage(), 'user-uploads/userB/avatar.png'), bytes));
  });
});

describe('storage: branding — admin-only write', () => {
  it('BLOCKS a coach from writing branding assets', async () => {
    await seedUser('coach1', { role: 'coach', email: 'coach1@example.com', assignedTeams: ['teamA'], active: true });
    const ctx = testEnv.authenticatedContext('coach1', { email: 'coach1@example.com' });
    const bytes = new Uint8Array([1, 2, 3]);
    await assertFails(uploadBytes(ref(ctx.storage(), 'branding/logo.png'), bytes, { contentType: 'image/png' }));
  });
});

describe('storage: default-deny catch-all', () => {
  it('BLOCKS access to an undeclared path', async () => {
    await seedUser('userA', { role: 'admin', email: 'sarvinsukhe@gmail.com', active: true });
    const ctx = testEnv.authenticatedContext('userA', { email: 'sarvinsukhe@gmail.com' });
    await assertFails(getBytes(ref(ctx.storage(), 'random-path/secret.txt')));
  });
});
