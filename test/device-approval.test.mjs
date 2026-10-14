import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { createDeviceApprovalHandler } from '../src/device-approval-handler.mjs';
const source = name => readFile(new URL('../public/' + name, import.meta.url), 'utf8');
const approved = { schema: 'aleph.device-approval.v1', state: 'approved', deviceRegistered: true, deviceId: 'aaaaaaaaaaaaaaaa' };
const login = { user: { id: 'fixture-a' }, access_token: 'fixture-session' };

test('unconnected server never approves or queues a device, including forged body/header claims', async () => {
  const handler = createDeviceApprovalHandler({ verifyLogin: async authorization => authorization === 'fixture-login' ? { userId: 'fixture-a' } : null });
  for (const [method, authorization, expected] of [['GET', undefined, 401], ['GET', 'invalid', 401],
    ['GET', 'fixture-login', 503], ['POST', 'fixture-login', 503], ['PUT', 'fixture-login', 405]]) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await handler({ method, url: '/api/device-approval', headers: { authorization, 'x-device-registered': 'true' }, body: approved }, res);
    assert.equal(res.code, expected); assert.equal(res.data.deviceRegistered, false);
    assert.equal(res.data.state, 'unavailable'); assert.equal('deviceId' in res.data, false);
  }
});

async function harness() {
  let session = login;
  let responseData = { schema: 'aleph.device-approval.v1', state: 'pending', deviceRegistered: false };
  let responseStatus = 200, networkFails = false, suspended;
  const requests = [], access = [], status = { textContent: '' };
  const context = createContext({ AbortSignal,
    fetch: async (path, options) => {
      requests.push({ path, method: options.method });
      if (suspended) await suspended;
      if (networkFails) throw new Error('offline');
      return { ok: responseStatus === 200, status: responseStatus, json: async () => responseData };
    },
  });
  runInContext((await source('device-approval.js')).replace('export function ', 'function '), context);
  const gate = context.createDeviceApproval({ getSession: async () => ({ data: { session }, error: null }),
    onAccessChange: value => access.push(value), status });
  return { gate, requests, access, status, context,
    reply: (data, code = 200) => { responseData = data; responseStatus = code; },
    offline: () => { networkFails = true; }, logout: () => { session = null; },
    suspend: promise => { suspended = promise; } };
}

test('pending, unconnected, malformed and offline results keep protected access closed', async () => {
  const h = await harness();
  for (const data of [{ state: 'approved' }, { ...approved, deviceId: undefined },
    { ...approved, deviceRegistered: 'true' }, { ...approved, state: 'pending' }]) {
    h.reply(data); assert.equal(await h.gate.check(), false);
  }
  h.reply({ reasonCode: 'device_approval_unavailable' }, 503);
  assert.equal(await h.gate.requestApproval(), false);
  assert.match(h.status.textContent, /접수되지 않았습니다/);
  h.offline(); assert.equal(await h.gate.check(), false);
  assert.equal(h.access.includes(true), false);
});

test('button response alone does not grant approval; a subsequent server GET must confirm it', async () => {
  const h = await harness();
  h.reply({ ...approved, state: 'pending' });
  assert.equal(await h.gate.requestApproval(), false);
  assert.deepEqual(h.requests.map(r => r.method), ['POST', 'GET']);
  assert.equal(h.access.includes(true), false);
  h.reply(approved); assert.equal(await h.gate.check(), true);
  assert.equal(h.access.at(-1), true);
  h.gate.invalidate(); assert.equal(h.access.at(-1), false);
});

test('a status result arriving after logout cannot reopen protected access', async () => {
  const h = await harness(); h.reply(approved);
  let resolve;
  h.suspend(new Promise(done => { resolve = done; }));
  const checking = h.gate.check();
  await new Promise(done => setImmediate(done));
  h.logout(); h.gate.invalidate(); resolve();
  assert.equal(await checking, false); assert.equal(h.access.includes(true), false);
});

test('actual page makes no memo request before verification and opens the existing list only after mocked server approval', async () => {
  const h = await harness(), timers = [], nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '', value: '', disabled: false, children: [], listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      reset() {}, replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); } });
    return nodes.get(id);
  };
  let authListener, loggedIn = login;
  h.context.suppliedAuth = { getSession: async () => ({ data: { session: loggedIn }, error: null }),
    onAuthStateChange: callback => { authListener = callback; callback('INITIAL_SESSION', loggedIn); },
    signOut: async () => { loggedIn = null; authListener('SIGNED_OUT', null); return { error: null }; } };
  h.context.document = { querySelector: selector => node(selector), createElement: name => node('created-' + name) };
  h.context.window = { addEventListener() {} };
  h.context.setTimeout = callback => timers.push(callback);
  let state = 'pending'; const calls = [];
  h.context.fetch = async (path, options) => {
    calls.push(path);
    return { ok: true, status: 200, json: async () => path === '/api/device-approval'
      ? { ...approved, state, deviceRegistered: state === 'approved' } : [] };
  };
  const html = await source('index.html');
  const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace("import { createDeviceApproval } from '/device-approval.js';", '')
    .replace("const { createBrowserAuth } = await import('/auth-client.js');", 'const createBrowserAuth = () => suppliedAuth;');
  await runInContext('(async () => {' + code + '})()', h.context);
  for (const timer of timers) await timer();
  assert.equal(calls.includes('/api/notes'), false);
  assert.equal(node('#notes').hidden, true); assert.equal(node('#note-form').hidden, true);
  state = 'approved'; await node('#device-refresh').listeners.click();
  assert.equal(calls.filter(path => path === '/api/notes').length, 1);
  assert.equal(node('#notes').hidden, false); assert.equal(node('#note-form').hidden, false);
  await node('#logout-button').listeners.click();
  assert.equal(node('#notes').hidden, true); assert.equal(node('#notes').children.length, 0);
});
