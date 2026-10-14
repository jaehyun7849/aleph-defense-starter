import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoAccess } from '../public/demo-device-client.js';

function harness() {
  let session = { user: { id: 'fixture-a' }, access_token: 'fixture-login' };
  let state = 'pending', postState = 'pending', networkFails = false, suspended;
  const events = [], calls = [];
  const gate = createDemoAccess({ getSession: async () => ({ data: { session }, error: null }),
    onState: e => events.push(e), fetcher: async (path, options) => {
      calls.push({ path, ...options });
      if (suspended) await suspended;
      if (networkFails) throw new Error('offline');
      return { ok: true, json: async () => ({ demo: true, requestId: 'fixture-request',
        state: options.method === 'POST' ? postState : state,
        ...(options.method === 'POST' ? { sessionToken: 'a'.repeat(43) } : {}) }) };
    } });
  return { gate, events, calls, reply: value => { state = value; }, post: value => { postState = value; },
    logout: () => { session = null; gate.reset(); }, offline: () => { networkFails = true; }, suspend: value => { suspended = value; } };
}
test('approval request and even an approved POST cannot unlock a pending GET', async () => {
  const h = harness(); h.post('approved');
  assert.equal(await h.gate.requestApproval(), false);
  assert.deepEqual(h.calls.map(c => c.method), ['POST', 'GET']);
  assert.equal(h.events.some(e => e.state === 'approved'), false);
  assert.equal(h.calls[1].headers['X-Demo-Session'], 'a'.repeat(43));
  h.reply('approved'); assert.equal(await h.gate.check(), true);
  assert.equal(h.events.at(-1).state, 'approved');
  h.reply('revoked'); assert.equal(await h.gate.check(), false);
  assert.equal(h.events.at(-1).state, 'revoked');
});
test('fresh page has no handle; logout and offline never keep approved state', async () => {
  const h = harness(); await h.gate.check();
  assert.equal('X-Demo-Session' in h.calls[0].headers, false);
  h.reply('approved'); await h.gate.requestApproval();
  h.offline(); assert.equal(await h.gate.check(), false); assert.equal(h.events.at(-1).state, 'error');
  h.logout(); assert.equal(h.events.at(-1).state, 'unregistered');
});
test('late approved reply after logout cannot open data', async () => {
  const h = harness(); h.reply('approved');
  let resolve; h.suspend(new Promise(done => { resolve = done; }));
  const checking = h.gate.check();
  await new Promise(done => setImmediate(done));
  h.logout(); resolve();
  assert.equal(await checking, false);
  assert.equal(h.events.some(e => e.state === 'approved'), false);
});

test('approved label without a demo session handle cannot mark the page approved', async () => {
  const h = harness(); h.reply('approved');
  assert.equal(await h.gate.check(), false);
  assert.equal(h.events.some(e => e.state === 'approved'), false);
});
test('old delayed check cannot overwrite a newer approved result', async () => {
  const h = harness(); await h.gate.requestApproval(); h.reply('approved');
  let resolve; h.suspend(new Promise(done => { resolve = done; }));
  const old = h.gate.check(); await new Promise(done => setImmediate(done));
  h.suspend(undefined);
  assert.equal(await h.gate.check(), true); resolve();
  assert.equal(await old, false); assert.equal(h.events.at(-1).state, 'approved');
});
test('data denial after approval emits a locked state', async () => {
  const events = []; let denied = false;
  const gate = createDemoAccess({ getSession: async () => ({ data: { session: { user: { id: 'fixture-a' }, access_token: 'fixture-login' } } }),
    onState: e => events.push(e), fetcher: async (path, options) => ({
      ok: !denied, status: denied ? 403 : 200,
      json: async () => denied ? { reasonCode: 'demo_not_approved', error: 'revoked' }
        : { demo: true, state: 'approved', ...(options.method === 'POST' ? { sessionToken: 'a'.repeat(43) } : {}) },
    }) });
  assert.equal(await gate.requestApproval(), true); denied = true;
  await assert.rejects(() => gate.call('/api/notes'), /revoked/);
  assert.equal(events.at(-1).state, 'error');
});
