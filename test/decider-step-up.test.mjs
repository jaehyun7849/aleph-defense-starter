import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('compound fixture requests reauthentication with a reason and the contract response', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide(normal)).decision, 'allow');
  const result = await decide(suspicious);
  assert.deepEqual(result, {
    schema: 'aleph.decision.v1', requestId: suspicious.requestId,
    decision: 'step_up', reasonCode: 'step_up_required',
    ruleIds: ['device_registered', 'resource_scope', 'step_up_required'],
  });
});

test('all three signals are required; region alone and missing evidence do not trigger', async () => {
  const { normal, suspicious } = fixtureRequests();
  const variants = [
    { ...normal, signals: { ...normal.signals, region: 'foreign' } },
    { ...suspicious, signals: { ...suspicious.signals, hour: 6 } },
    { ...suspicious, signals: { ...suspicious.signals, hour: null } },
    { ...suspicious, signals: { ...suspicious.signals, network: 'usual' } },
    { ...suspicious, signals: { ...suspicious.signals, network: 'unknown' } },
    { ...suspicious, recentEvents: null },
    { ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 61, count: 20 }] },
    { ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 19 }] },
    { ...suspicious, signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 3 } },
  ];
  for (const request of variants) assert.equal((await decide(request)).decision, 'allow');
  for (const hour of [0, 5, 22, 23]) {
    assert.equal((await decide({ ...suspicious, signals: { ...suspicious.signals, hour, region: 'local' } })).decision, 'step_up');
  }
});

test('only valid engine reauthentication permits the compound case, never an unregistered device', async () => {
  const { suspicious } = fixtureRequests();
  for (const authAgeSeconds of [0, 60, 900]) {
    assert.equal((await decide({ ...suspicious, stepUp: { verified: true, authAgeSeconds } })).decision, 'allow');
  }
  for (const stepUp of [undefined, { verified: false, authAgeSeconds: 60 },
    { verified: 'true', authAgeSeconds: 60 }, { verified: true, authAgeSeconds: -1 },
    { verified: true, authAgeSeconds: 901 }, { verified: true, authAgeSeconds: '60' }]) {
    assert.equal((await decide({ ...suspicious, stepUp })).decision, 'step_up');
  }
  const denied = await decide({ ...suspicious, deviceRegistered: false,
    stepUp: { verified: true, authAgeSeconds: 60 } });
  assert.equal(denied.decision, 'deny');
  assert.equal(denied.reasonCode, 'device_not_registered');
});
