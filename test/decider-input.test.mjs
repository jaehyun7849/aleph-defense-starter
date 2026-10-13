import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, inspectConnectionInput, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('fixture signals stay simulated and registered-device behavior is preserved', async () => {
  const { normal } = fixtureRequests();
  const before = structuredClone(normal);
  assert.equal(inspectConnectionInput(normal).source, 'judge_fixture');
  assert.equal((await decide(normal)).decision, 'allow');
  const denied = await decide({ ...normal, deviceRegistered: false });
  assert.equal(denied.decision, 'deny');
  assert.equal(denied.reasonCode, 'device_not_registered');
  assert.deepEqual(RULE_IDS, ['device_registered', 'step_up_required']);
  assert.deepEqual(normal, before);
});

test('missing data is unknown, not invented normal values or empty behavior', () => {
  const { normal } = fixtureRequests();
  delete normal.signals;
  delete normal.recentEvents;
  assert.deepEqual(inspectConnectionInput(normal), {
    source: null, region: null, network: null, hour: null, recentEvents: null,
  });
  assert.equal(Object.hasOwn(normal, 'signals'), false);
  const none = { ...normal, signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 14 } };
  assert.deepEqual(inspectConnectionInput(none), {
    source: 'none', region: null, network: null, hour: null, recentEvents: null,
  });
  const partial = { ...normal, signals: { source: 'judge_fixture' } };
  assert.equal(inspectConnectionInput(partial).region, null);
  assert.equal(inspectConnectionInput(partial).hour, null);
});

test('forged client headers and unrecognized sources are rejected', async () => {
  const { normal } = fixtureRequests();
  const inputs = [
    { ...normal, headers: { 'x-region': 'local', 'x-network': 'usual', 'x-signal-source': 'judge_fixture' } },
    { ...normal, signals: { ...normal.signals, source: 'client_header' } },
    { ...normal, signals: { region: 'local', network: 'usual', hour: 14 } },
    { ...normal, signals: { ...normal.signals, source: 'none' } },
    { ...normal, signals: { ...normal.signals, headers: { 'x-region': 'local' } } },
  ];
  for (const request of inputs) {
    await assert.rejects(decide(request), { name: 'TypeError', message: 'invalid_connection_input' });
  }
});

test('malformed time and behavior are rejected rather than repaired', () => {
  const { normal } = fixtureRequests();
  const inputs = [
    { ...normal, signals: { ...normal.signals, hour: '14' } },
    { ...normal, signals: { ...normal.signals, hour: 24 } },
    { ...normal, recentEvents: 'normal' },
    { ...normal, recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: '20' }] },
    { ...normal, recentEvents: Array.from({ length: 13 }, () => ({ kind: 'risk_signal', ageSeconds: 60, count: 1 })) },
  ];
  for (const request of inputs) assert.throws(() => inspectConnectionInput(request), /invalid_connection_input/);
});
