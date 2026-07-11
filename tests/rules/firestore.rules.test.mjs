import { readFileSync } from 'node:fs';
import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';

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

// Helper to seed data bypassing rules.
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

describe('users/{uid} — admin self-promotion allow-list', () => {
  it('BLOCKS a non-allow-listed email from self-creating role:admin', async () => {
    const uid = 'attacker1';
    const ctx = testEnv.authenticatedContext(uid, { email: 'attacker@evil.com' });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'users', uid), {
        role: 'admin',
        email: 'attacker@evil.com',
      })
    );
  });

  it('FIXED: blocks an UNVERIFIED spoofed allow-list email from getting admin', async () => {
    // Firebase Auth lets a client sign up with any email/password and the
    // token carries that email claim even before verification. isAdminEmail()
    // now requires request.auth.token.email_verified == true.
    const uid = 'spoofer1';
    const ctx = testEnv.authenticatedContext(uid, {
      email: 'sarvinsukhe@gmail.com',
      email_verified: false,
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'users', uid), {
        role: 'admin',
        email: 'sarvinsukhe@gmail.com',
      })
    );
  });

  it('ALLOWS admin self-create when the allow-listed email IS verified', async () => {
    const uid = 'realadmin1';
    const ctx = testEnv.authenticatedContext(uid, {
      email: 'sarvinsukhe@gmail.com',
      email_verified: true,
    });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'users', uid), {
        role: 'admin',
        email: 'sarvinsukhe@gmail.com',
      })
    );
  });

  it('BLOCKS an existing coach from self-updating role to admin even off allow-list', async () => {
    const uid = 'coach1';
    await seed(async (db) => {
      await setDoc(doc(db, 'users', uid), {
        role: 'coach',
        email: 'coach1@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
    });
    const ctx = testEnv.authenticatedContext(uid, { email: 'coach1@example.com' });
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'admin' })
    );
  });

  it('BLOCKS a coach with an allow-listed email from self-updating other protected fields alongside role staying same (sanity: unrelated field ok)', async () => {
    const uid = 'coach2';
    await seed(async (db) => {
      await setDoc(doc(db, 'users', uid), {
        role: 'coach',
        email: 'coach2@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
    });
    const ctx = testEnv.authenticatedContext(uid, { email: 'coach2@example.com' });
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', uid), { displayName: 'Coach Two' })
    );
  });
});

describe('users/{uid} — assignedTeams / roster read scoping', () => {
  it('BLOCKS a coach from reading a swimmer on a DIFFERENT team', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'coachA'), {
        role: 'coach',
        email: 'coachA@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
      await setDoc(doc(db, 'users', 'swimmerB'), {
        role: 'swimmer',
        email: 'swimmerB@example.com',
        assignedTeams: ['teamB'],
        active: true,
      });
    });
    const ctx = testEnv.authenticatedContext('coachA', { email: 'coachA@example.com' });
    await assertFails(getDoc(doc(ctx.firestore(), 'users', 'swimmerB')));
  });

  it('ALLOWS a coach to read a swimmer sharing a team', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'coachA'), {
        role: 'coach',
        email: 'coachA@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
      await setDoc(doc(db, 'users', 'swimmerA'), {
        role: 'swimmer',
        email: 'swimmerA@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
    });
    const ctx = testEnv.authenticatedContext('coachA', { email: 'coachA@example.com' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'users', 'swimmerA')));
  });
});

describe('teams/{teamId} — roster tamper via invite-redemption swimmers[] path', () => {
  it('FIXED: blocks a non-staff caller from REMOVING another swimmer while adding themself', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'swimmerX'), {
        role: 'swimmer',
        email: 'x@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
      await setDoc(doc(db, 'teams', 'teamA'), {
        name: 'Team A',
        swimmers: ['existingSwimmer'],
      });
    });
    const ctx = testEnv.authenticatedContext('swimmerX', { email: 'x@example.com' });
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'teams', 'teamA'), {
        swimmers: ['swimmerX'], // attempts to drop 'existingSwimmer', add self
      })
    );
  });

  it('ALLOWS a non-staff caller to ADD only themself without removing anyone', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'swimmerY'), {
        role: 'swimmer',
        email: 'y@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
      await setDoc(doc(db, 'teams', 'teamA'), {
        name: 'Team A',
        swimmers: ['existingSwimmer'],
      });
    });
    const ctx = testEnv.authenticatedContext('swimmerY', { email: 'y@example.com' });
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'teams', 'teamA'), {
        swimmers: ['existingSwimmer', 'swimmerY'],
      })
    );
  });
});

describe('auditLogs/{logId} — append-only, own-actor-only, no edits', () => {
  it('BLOCKS a signed-in user from writing an entry impersonating another actorId', async () => {
    const ctx = testEnv.authenticatedContext('swimmerZ', { email: 'z@example.com' });
    await assertFails(
      addDoc(collection(ctx.firestore(), 'auditLogs'), {
        actorId: 'someOtherUid',
        action: 'fake_event',
        at: Date.now(),
      })
    );
  });

  it('ALLOWS a signed-in user to append an entry about their own action', async () => {
    const ctx = testEnv.authenticatedContext('swimmerZ', { email: 'z@example.com' });
    await assertSucceeds(
      addDoc(collection(ctx.firestore(), 'auditLogs'), {
        actorId: 'swimmerZ',
        action: 'login',
        at: Date.now(),
      })
    );
  });

  it('BLOCKS any update to an existing auditLogs entry, even by admin', async () => {
    let logId;
    await seed(async (db) => {
      const ref = await addDoc(collection(db, 'auditLogs'), {
        actorId: 'someone',
        action: 'seeded',
        at: Date.now(),
      });
      logId = ref.id;
    });
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'admin1'), {
        role: 'admin',
        email: 'sarvinsukhe@gmail.com',
        active: true,
      });
    });
    const ctx = testEnv.authenticatedContext('admin1', { email: 'sarvinsukhe@gmail.com' });
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'auditLogs', logId), { action: 'tampered' })
    );
  });

  it('BLOCKS a non-admin from reading auditLogs', async () => {
    let logId;
    await seed(async (db) => {
      const ref = await addDoc(collection(db, 'auditLogs'), {
        actorId: 'swimmerZ',
        action: 'seeded',
        at: Date.now(),
      });
      logId = ref.id;
    });
    const ctx = testEnv.authenticatedContext('swimmerZ', { email: 'z@example.com' });
    await assertFails(getDoc(doc(ctx.firestore(), 'auditLogs', logId)));
  });
});

describe('default-deny catch-all', () => {
  it('BLOCKS read/write to a collection not covered by any explicit match', async () => {
    const ctx = testEnv.authenticatedContext('admin1', { email: 'sarvinsukhe@gmail.com' });
    await assertFails(getDoc(doc(ctx.firestore(), 'someUndeclaredCollection', 'doc1')));
    await assertFails(
      setDoc(doc(ctx.firestore(), 'someUndeclaredCollection', 'doc1'), { x: 1 })
    );
  });
});

describe('demoted / banned user — immediate loss of access (server-side)', () => {
  it('an admin instantly loses admin-only write access the moment their role doc flips to coach', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'exAdmin'), {
        role: 'admin',
        email: 'exadmin@example.com',
        active: true,
      });
    });
    const ctx = testEnv.authenticatedContext('exAdmin', { email: 'exadmin@example.com' });

    // While still admin: can write global settings.
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'settings', 'app'), { clubName: 'Rec Rays' }));

    // Admin demotes them (simulates another admin's setUserRole() call).
    await seed(async (db) => {
      await updateDoc(doc(db, 'users', 'exAdmin'), { role: 'coach' });
    });

    // Rules re-read the live doc on every request — no token refresh needed.
    await assertFails(setDoc(doc(ctx.firestore(), 'settings', 'app'), { clubName: 'Hacked' }));
    await assertFails(deleteDoc(doc(ctx.firestore(), 'users', 'someoneElse')));
  });

  it('a banned (active:false) user instantly loses signup-creation access', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'bannedSwimmer'), {
        role: 'swimmer',
        email: 'banned@example.com',
        assignedTeams: ['teamA'],
        active: true,
      });
    });
    const ctx = testEnv.authenticatedContext('bannedSwimmer', { email: 'banned@example.com' });

    await assertSucceeds(
      addDoc(collection(ctx.firestore(), 'signups'), {
        swimmerId: 'bannedSwimmer',
        teamId: 'teamA',
        eventId: 'ev1',
      })
    );

    await seed(async (db) => {
      await updateDoc(doc(db, 'users', 'bannedSwimmer'), { active: false });
    });

    await assertFails(
      addDoc(collection(ctx.firestore(), 'signups'), {
        swimmerId: 'bannedSwimmer',
        teamId: 'teamA',
        eventId: 'ev2',
      })
    );
  });
});
