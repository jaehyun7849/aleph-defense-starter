import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, readDetectionEvents } from '../src/detect.mjs';
import { checkDetection } from '../scripts/detect-test.mjs';

function events(count = 121, start = 0, extra = {}) {
  return Array.from({length: count}, (_, i) => ({
    at: new Date(Date.UTC(2026, 9, 1) + start + i * 1000).toISOString(),
    method: 'GET', identity: { sub: 'learner_fixture' },
    signals: { source: 'judge_fixture', network: 'unusual' },
    deviceId: 'aaaaaaaaaaaaaaaa', deviceRegistered: true, ...extra,
  }));
}
test('compound practice checks all pass against the exported detect function', async () => {
  const checks = await checkDetection(detect);
  assert.ok(checks.every(check => check.passed), JSON.stringify(checks));
});
test('sliding windows handle unsorted events, exact ten-minute bounds and expired network evidence', () => {
  const input = events();
  const before = structuredClone(input);
  assert.equal(detect([...input].reverse()).action, 'propose_revocation');
  assert.deepEqual(input, before);
  const boundary = events(120, 1);
  boundary.push(events(1, 600001)[0]);
  assert.equal(detect(boundary).action, 'propose_revocation');
  boundary[120].at = new Date(Date.UTC(2026, 9, 1) + 600002).toISOString();
  assert.equal(detect(boundary).action, 'observe');
  const usual = events(121, 600001, { signals: { source: 'judge_fixture', network: 'usual' } });
  assert.equal(detect([...events(1), ...usual]).action, 'observe');
});
test('proposal is single-device only; no source promotion or private-field copying', () => {
  const result = detect(events());
  assert.deepEqual(result, { action: 'propose_revocation', reasonCode: 'burst_read',
    subject: 'learner_fixture', deviceId: 'aaaaaaaaaaaaaaaa' });
  assert.equal(detect(events(121, 0, { method: 'PUT' })).action, 'observe');
  assert.equal(detect(events(121, 0, { deviceRegistered: false })).action, 'observe');
  assert.equal(detect(events(121, 0, { signals: { source: 'none', network: 'unusual' } })).action, 'observe');
  assert.throws(() => detect(events(121, 0, { signals: { source: 'client_header', network: 'unusual' } })), /invalid_detection_events/);
  assert.throws(() => detect(events(121, 0, { deviceId: 'invalid' })), /invalid_detection_events/);
  const input = events(1);
  for (const key of ['body', 'token', 'name']) Object.defineProperty(input[0], key, {
    get() { throw new Error('private field read'); }, enumerable: true,
  });
  assert.equal(readDetectionEvents(input)[0].signals.network, 'unusual');
});

test('v1 burst proposes only the provided subject and cannot be triggered by mixed or incomplete extension metadata', () => {
  const original = events().map(({at,method,identity})=>({at,method,identity}));
  assert.deepEqual(detect([...original].reverse()), {
    action:'propose_revocation', reasonCode:'burst_read', subject:'learner_fixture',
  });
  const zeroNetworkProof = original.map(e=>({...e,signals:{source:'none'}}));
  assert.deepEqual(detect(zeroNetworkProof), {action:'observe'});
  assert.deepEqual(detect([...original,...events(1,0,{signals:{source:'judge_fixture',network:'usual'}})]), {action:'observe'});
  assert.deepEqual(detect(original.map(e=>({...e,deviceRegistered:false}))), {action:'observe'});
  const boundary = original.slice(0,120);
  boundary.push({...original[120],at:'2026-10-01T00:10:00.000Z'});
  assert.equal(detect(boundary).action,'propose_revocation');
  boundary[120].at = '2026-10-01T00:10:00.001Z';
  assert.equal(detect(boundary).action,'observe');
});
