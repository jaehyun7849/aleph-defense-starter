import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoHandler } from '../src/demo-approval.mjs';
import { createDemoStore } from '../src/demo-approval-store.mjs';
import { readFile } from 'node:fs/promises';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const ADMIN = '00000000-0000-4000-8000-000000000003';
function fixture() {
  const rows = new Map();
  const store = {
    async find(owner, hash) { return [...rows.values()].find(r => r.owner_user_id === owner && r.session_hash === hash) ?? null; },
    async request(row) { for (const [id, r] of rows) if (r.owner_user_id === row.owner_user_id) rows.delete(id); rows.set(row.id, row); return row; },
    async list() { return [...rows.values()]; },
    async transition(id, state, admin) {
      const row = rows.get(id);
      if (!row || (state === 'approved' ? row.state !== 'pending' : !['pending', 'approved'].includes(row.state))) return null;
      row.state = state; row.approved_by = admin; return row;
    },
  };
  const options = { verifyLogin: async header => {
    const userId = { a: A, b: B, admin: ADMIN }[header];
    return userId ? { kind: 'student', userId } : null;
  }, getStore: async () => store, env: { DEMO_APPROVAL_ADMIN_IDS: ADMIN } };
  const handler = createDemoHandler(options);
  async function send({ actor = 'a', path = '/api/demo-device', method = 'GET', body, token, headers = {}, using = handler } = {}) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await using({ url: path, method, body, headers: { authorization: actor, ...(token ? { 'x-demo-session': token } : {}), ...headers } }, res);
    return res;
  }
  return { rows, store, options, send };
}
test('server approval is separate from request, survives handler recreation and gates dummy data', async () => {
  const f = fixture();
  assert.equal((await f.send({ path: '/api/demo-notes' })).code, 403);
  const request = await f.send({ method: 'POST', body: { action: 'request' } });
  assert.equal(request.code, 201); assert.equal(request.data.state, 'pending');
  const token = request.data.sessionToken;
  assert.equal((await f.send({ token })).data.state, 'pending');
  assert.equal((await f.send({ token, path: '/api/demo-notes', headers: { 'x-app-installed': 'true', 'x-device-registered': 'true' } })).code, 403);
  const repeat = await f.send({ method: 'POST', token, body: { action: 'request' } });
  assert.equal(repeat.data.state, 'pending'); assert.equal('sessionToken' in repeat.data, false);
  assert.equal((await f.send({ actor: 'admin', method: 'POST', body: { action: 'approve', requestId: request.data.requestId } })).code, 200);
  const otherInstance = createDemoHandler(f.options);
  assert.equal((await f.send({ token, using: otherInstance })).data.state, 'approved');
  const data = await f.send({ path: '/api/demo-notes', token, using: otherInstance });
  assert.equal(data.code, 200); assert.equal(data.data.demo, true); assert.equal(data.data.notes.length, 1);
  const list = await f.send({ actor: 'admin', method: 'POST', body: { action: 'list' } });
  assert.equal('session_hash' in list.data.requests[0], false);
  assert.equal('owner_user_id' in list.data.requests[0], false);
});
test('non-admin cannot list, approve or revoke; forged state and identity fields are rejected', async () => {
  const f = fixture(); const request = await f.send({ method: 'POST', body: { action: 'request' } });
  for (const action of ['list', 'approve', 'revoke']) {
    const body = action === 'list' ? { action } : { action, requestId: request.data.requestId };
    assert.equal((await f.send({ method: 'POST', body })).code, 403);
  }
  for (const extra of [{ approved: true }, { role: 'admin' }, { deviceRegistered: true }, { userId: ADMIN }])
    assert.equal((await f.send({ method: 'POST', body: { action: 'request', ...extra } })).code, 400);
  assert.equal((await f.send({ token: request.data.sessionToken })).data.state, 'pending');
});
test('approved demo is bound to account and session; new page and revocation deny access', async () => {
  const f = fixture(); const request = await f.send({ method: 'POST', body: { action: 'request' } });
  await f.send({ actor: 'admin', method: 'POST', body: { action: 'approve', requestId: request.data.requestId } });
  assert.equal((await f.send({ actor: 'b', token: request.data.sessionToken, path: '/api/demo-notes' })).code, 403);
  assert.equal((await f.send({ path: '/api/demo-notes' })).code, 403);
  await f.send({ actor: 'admin', method: 'POST', body: { action: 'revoke', requestId: request.data.requestId } });
  assert.equal((await f.send({ token: request.data.sessionToken, path: '/api/demo-notes' })).code, 403);
  const next = await f.send({ method: 'POST', body: { action: 'request' } });
  assert.equal(next.data.state, 'pending'); assert.notEqual(next.data.requestId, request.data.requestId);
  assert.equal((await f.send({ actor: 'admin', method: 'POST', body: { action: 'approve', requestId: request.data.requestId } })).code, 409);
  assert.equal(f.rows.size, 1);
});
test('invalid login/routes and unavailable storage never return dummy data', async () => {
  const f = fixture();
  assert.equal((await f.send({ actor: undefined, headers: { authorization: undefined } })).code, 401);
  assert.equal((await f.send({ actor: 'invalid' })).code, 401);
  for (const path of ['/api/notes', '/api/demo-notes?approved=true']) assert.equal((await f.send({ path })).code, 404);
  assert.equal((await f.send({ method: 'DELETE' })).code, 405);
  const broken = createDemoHandler({ ...f.options, getStore: async () => { throw new Error('private detail'); } });
  const response = await f.send({ using: broken, path: '/api/demo-notes' });
  assert.equal(response.code, 503); assert.equal('notes' in response.data, false); assert.doesNotMatch(JSON.stringify(response.data), /private detail/);
});
test('missing administrator configuration fails before creating an unapprovable request', async () => {
  const f = fixture();
  for (const ids of ['', 'not-a-user-id']) {
    const handler = createDemoHandler({ ...f.options, env: { DEMO_APPROVAL_ADMIN_IDS: ids } });
    const res = await f.send({ using: handler, method: 'POST', body: { action: 'request' } });
    assert.equal(res.code, 503); assert.equal(res.data.reasonCode, 'demo_setup_required');
    assert.equal(f.rows.size, 0);
  }
});
test('SQL blocks direct browser roles, store constrains account/session and atomic state transitions', async () => {
  const sql = await readFile(new URL('../docs/DEMO_APPROVAL.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/); assert.match(sql, /revoke all.*from anon, authenticated/);
  const calls = [];
  function query() {
    const q = { then(resolve) { resolve({ data: null, error: null }); } };
    for (const name of ['select', 'eq', 'in', 'update', 'upsert', 'order', 'limit', 'maybeSingle', 'single'])
      q[name] = (...args) => { calls.push([name, ...args]); return q; };
    return q;
  }
  const store = createDemoStore({ from(name) { assert.equal(name, 'demo_device_approvals'); return query(); } });
  await store.find(A, 'hash');
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'owner_user_id' && c[2] === A));
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'session_hash' && c[2] === 'hash'));
  calls.length = 0; await store.transition(A, 'approved', ADMIN);
  assert.ok(calls.some(c => c[0] === 'in' && c[1] === 'state' && c[2].join() === 'pending'));
  const broken = createDemoStore({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ error: {} }) }) }) }) }) });
  await assert.rejects(() => broken.find(A, 'hash'), /demo_store_failed/);
});
