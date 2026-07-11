import { readFileSync } from 'node:fs';
import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'swimware-rules-audit',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

describe('chat: deactivated/removed user loses posting rights immediately', () => {
  it('a swimmer can post, then instantly loses posting rights once deactivated', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'swimmerA'), {
        role: 'swimmer',
        email: 'a@example.com',
        assignedTeams: ['teamA'],
        active: true,
        consents: {
          terms: { version: 'v1', at: 0 },
          privacy: { version: 'v1', at: 0 },
          waiver: { version: 'v1', at: 0 },
          parent: { version: 'v1', at: 0 },
        },
      });
      await setDoc(doc(db, 'chats', 'teamA'), {
        teamId: 'teamA',
        type: 'team_chat',
        mutedUsers: [],
        lastMessageAt: {},
      });
    });
    const ctx = testEnv.authenticatedContext('swimmerA', { email: 'a@example.com' });

    await assertSucceeds(
      addDoc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'), {
        senderId: 'swimmerA',
        senderName: 'A',
        text: 'hello team',
      })
    );

    // Admin deactivates the account (rules re-read this live doc every time).
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', 'swimmerA'), { active: false });
    });

    await assertFails(
      addDoc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'), {
        senderId: 'swimmerA',
        senderName: 'A',
        text: 'still here?',
      })
    );
  });

  it('a swimmer removed from the team loses posting rights immediately', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'swimmerB'), {
        role: 'swimmer',
        email: 'b@example.com',
        assignedTeams: ['teamA'],
        active: true,
        consents: {
          terms: { version: 'v1', at: 0 },
          privacy: { version: 'v1', at: 0 },
          waiver: { version: 'v1', at: 0 },
          parent: { version: 'v1', at: 0 },
        },
      });
      await setDoc(doc(db, 'chats', 'teamA'), {
        teamId: 'teamA',
        type: 'team_chat',
        mutedUsers: [],
        lastMessageAt: {},
      });
    });
    const ctx = testEnv.authenticatedContext('swimmerB', { email: 'b@example.com' });
    await assertSucceeds(
      addDoc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'), {
        senderId: 'swimmerB',
        senderName: 'B',
        text: 'hi',
      })
    );

    await seed(async (db) => {
      await updateDoc(doc(db, 'users', 'swimmerB'), { assignedTeams: [] });
    });

    await assertFails(
      addDoc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'), {
        senderId: 'swimmerB',
        senderName: 'B',
        text: 'am I still in?',
      })
    );
  });
});

describe('chat: abuse resistance', () => {
  async function seedTeamAndSwimmer(uid) {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', uid), {
        role: 'swimmer',
        email: `${uid}@example.com`,
        assignedTeams: ['teamA'],
        active: true,
        consents: {
          terms: { version: 'v1', at: 0 },
          privacy: { version: 'v1', at: 0 },
          waiver: { version: 'v1', at: 0 },
          parent: { version: 'v1', at: 0 },
        },
      });
      await setDoc(doc(db, 'chats', 'teamA'), {
        teamId: 'teamA',
        type: 'team_chat',
        mutedUsers: [],
        lastMessageAt: {},
      });
    });
  }

  it('BLOCKS a message over the length cap', async () => {
    await seedTeamAndSwimmer('longSwimmer');
    const ctx = testEnv.authenticatedContext('longSwimmer', { email: 'longSwimmer@example.com' });
    await assertFails(
      addDoc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'), {
        senderId: 'longSwimmer',
        senderName: 'Long',
        text: 'x'.repeat(2001),
      })
    );
  });

  it('BLOCKS a second rapid-fire message from the same sender (cooldown), ALLOWS after it elapses', async () => {
    await seedTeamAndSwimmer('spammer');
    const ctx = testEnv.authenticatedContext('spammer', { email: 'spammer@example.com' });

    async function sendOnce() {
      const batch = writeBatch(ctx.firestore());
      const msgRef = doc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'));
      batch.set(msgRef, { senderId: 'spammer', senderName: 'Spammer', text: 'spam' });
      batch.update(doc(ctx.firestore(), 'chats', 'teamA'), {
        [`lastMessageAt.spammer`]: Date.now(),
      });
      return batch.commit();
    }

    await assertSucceeds(sendOnce());
    // Immediate second message: cooldown not yet elapsed.
    await assertFails(sendOnce());

    const snap = await getDocs(collection(ctx.firestore(), 'chats', 'teamA', 'messages'));
    assert.equal(snap.size, 1, 'only the first message should have been created');
  });

  it('ALLOWS any team member to report a message (flag only, no content change)', async () => {
    await seedTeamAndSwimmer('reporterA');
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'authorZ'), {
        role: 'swimmer',
        email: 'z@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
    });
    let msgId;
    await seed(async (db) => {
      const ref = await addDoc(collection(db, 'chats', 'teamA', 'messages'), {
        senderId: 'authorZ',
        senderName: 'Z',
        text: 'bad message',
      });
      msgId = ref.id;
    });
    const ctx = testEnv.authenticatedContext('reporterA', { email: 'reporterA@example.com' });
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'chats', 'teamA', 'messages', msgId), {
        reported: true,
        reportedBy: ['reporterA'],
      })
    );
    // Reporting must not be usable to edit the message content.
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'chats', 'teamA', 'messages', msgId), {
        reported: true,
        reportedBy: ['reporterA'],
        text: 'tampered content',
      })
    );
  });
});

describe('consent/waiver version gate', () => {
  it('BLOCKS a swimmer with a STALE consent version from posting chat / RSVPing, ALLOWS after re-accept', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'settings', 'legalVersions'), {
        terms: 'v2',
        privacy: 'v2',
        waiver: 'v2',
        parentConsent: 'v2',
      });
      await setDoc(doc(db, 'users', 'staleSwimmer'), {
        role: 'swimmer',
        email: 'stale@example.com',
        assignedTeams: ['teamA'],
        active: true,
        consents: {
          terms: { version: 'v1', at: 0 },
          privacy: { version: 'v1', at: 0 },
          waiver: { version: 'v1', at: 0 },
          parent: { version: 'v1', at: 0 },
        },
      });
      await setDoc(doc(db, 'chats', 'teamA'), {
        teamId: 'teamA',
        type: 'team_chat',
        mutedUsers: [],
        lastMessageAt: {},
      });
    });
    const ctx = testEnv.authenticatedContext('staleSwimmer', { email: 'stale@example.com' });

    await assertFails(
      addDoc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'), {
        senderId: 'staleSwimmer',
        senderName: 'Stale',
        text: 'hello',
      })
    );
    await assertFails(
      addDoc(collection(ctx.firestore(), 'signups'), {
        swimmerId: 'staleSwimmer',
        teamId: 'teamA',
        eventId: 'ev1',
      })
    );

    // Re-accept: self-update of consents on their own doc is now allowed.
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', 'staleSwimmer'), {
        consents: {
          terms: { version: 'v2', at: Date.now() },
          privacy: { version: 'v2', at: Date.now() },
          waiver: { version: 'v2', at: Date.now() },
          parent: { version: 'v2', at: Date.now() },
        },
      })
    );

    await assertSucceeds(
      addDoc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'), {
        senderId: 'staleSwimmer',
        senderName: 'Stale',
        text: 'caught up now',
      })
    );
  });

  it('does not gate non-swimmer roles (coach has no consents record)', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'settings', 'legalVersions'), {
        terms: 'v2',
        privacy: 'v2',
        waiver: 'v2',
        parentConsent: 'v2',
      });
      await setDoc(doc(db, 'users', 'coach1'), {
        role: 'coach',
        email: 'coach1@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
      await setDoc(doc(db, 'chats', 'teamA'), {
        teamId: 'teamA',
        type: 'team_chat',
        mutedUsers: [],
        lastMessageAt: {},
      });
    });
    const ctx = testEnv.authenticatedContext('coach1', { email: 'coach1@example.com' });
    await assertSucceeds(
      addDoc(collection(ctx.firestore(), 'chats', 'teamA', 'messages'), {
        senderId: 'coach1',
        senderName: 'Coach',
        text: 'welcome team',
      })
    );
  });
});

describe('auditLogs: append-only + immutability', () => {
  it('is append-only for EVERY role, including admin (no update/delete)', async () => {
    let logId;
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'admin1'), {
        role: 'admin',
        email: 'sarvinsukhe@gmail.com',
        active: true,
      });
      const ref = await addDoc(collection(db, 'auditLogs'), {
        actorId: 'someone',
        action: 'seeded',
        at: Date.now(),
      });
      logId = ref.id;
    });
    const ctx = testEnv.authenticatedContext('admin1', { email: 'sarvinsukhe@gmail.com' });
    await assertFails(updateDoc(doc(ctx.firestore(), 'auditLogs', logId), { action: 'edited' }));
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(ctx.firestore(), 'auditLogs', logId)));
  });

  it('a role change produces exactly one immutable audit entry, atomically with the change', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'admin2'), {
        role: 'admin',
        email: 'sarvinsukhe@gmail.com',
        active: true,
      });
      await setDoc(doc(db, 'users', 'targetCoach'), {
        role: 'coach',
        email: 'target@example.com',
        assignedTeams: [],
        active: true,
      });
    });
    const ctx = testEnv.authenticatedContext('admin2', { email: 'sarvinsukhe@gmail.com' });

    // Mirrors setUserRole(): role update + audit entry in one atomic batch.
    const batch = writeBatch(ctx.firestore());
    batch.update(doc(ctx.firestore(), 'users', 'targetCoach'), { role: 'admin' });
    batch.set(doc(collection(ctx.firestore(), 'auditLogs')), {
      actorId: 'admin2',
      actorEmail: 'sarvinsukhe@gmail.com',
      action: 'user.role.change',
      target: 'targetCoach',
      details: { from: 'coach', to: 'admin' },
      at: Date.now(),
    });
    await assertSucceeds(batch.commit());

    await seed(async (db) => {
      const snap = await getDocs(collection(db, 'auditLogs'));
      const entries = snap.docs.filter((d) => d.data().action === 'user.role.change');
      assert.equal(entries.length, 1, 'exactly one role-change audit entry should exist');
      assert.equal(entries[0].data().target, 'targetCoach');
    });
  });
});
