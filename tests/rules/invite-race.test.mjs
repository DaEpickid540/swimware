import { readFileSync } from 'node:fs';
import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  getDoc,
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

// Mirrors acceptInvite()'s write batch, for a given caller uid.
function redeemBatch(db, uid, token, teamId) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), {
    role: 'swimmer',
    email: `${uid}@example.com`,
    displayName: uid,
    assignedTeams: [teamId],
    invitedVia: token,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'inviteTokens', token), {
    used: true,
    usedBy: uid,
    usedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'teams', teamId), { swimmers: arrayUnion(uid) });
  return batch.commit();
}

describe('inviteTokens — concurrent single-use redemption race', () => {
  it('only ONE of two concurrent redeemers of the SAME token succeeds', async () => {
    const token = 'race-token-1';
    const teamId = 'teamA';
    await seed(async (db) => {
      await setDoc(doc(db, 'teams', teamId), { name: 'Team A', swimmers: [] });
      await setDoc(doc(db, 'inviteTokens', token), {
        token,
        teamId,
        coachId: 'coach1',
        expiresAt: Date.now() + 60_000,
        used: false,
        usedBy: null,
        revoked: false,
        createdAt: serverTimestamp(),
      });
    });

    const ctxA = testEnv.authenticatedContext('racerA', { email: 'racerA@example.com' });
    const ctxB = testEnv.authenticatedContext('racerB', { email: 'racerB@example.com' });

    const [resA, resB] = await Promise.allSettled([
      redeemBatch(ctxA.firestore(), 'racerA', token, teamId),
      redeemBatch(ctxB.firestore(), 'racerB', token, teamId),
    ]);

    const outcomes = [resA.status, resB.status];
    const fulfilledCount = outcomes.filter((s) => s === 'fulfilled').length;
    const rejectedCount = outcomes.filter((s) => s === 'rejected').length;

    console.log('    -> racerA:', resA.status, '  racerB:', resB.status);

    assert.equal(fulfilledCount, 1, 'exactly one redeemer should succeed');
    assert.equal(rejectedCount, 1, 'exactly one redeemer should be denied');

    // The loser must NOT have their swimmer doc created (whole batch atomic).
    await seed(async (db) => {
      const winnerUid = resA.status === 'fulfilled' ? 'racerA' : 'racerB';
      const loserUid = resA.status === 'fulfilled' ? 'racerB' : 'racerA';
      const winnerDoc = await getDoc(doc(db, 'users', winnerUid));
      const loserDoc = await getDoc(doc(db, 'users', loserUid));
      assert.ok(winnerDoc.exists(), 'winner should have a swimmer profile');
      assert.ok(!loserDoc.exists(), 'loser must NOT have a swimmer profile (atomic batch rollback)');

      const tokenDoc = await getDoc(doc(db, 'inviteTokens', token));
      assert.equal(tokenDoc.data().used, true);
      assert.equal(tokenDoc.data().usedBy, winnerUid, 'token must record only the winner');

      const teamDoc = await getDoc(doc(db, 'teams', teamId));
      assert.deepEqual(teamDoc.data().swimmers, [winnerUid], 'only the winner should be on the roster');
    });
  });
});
