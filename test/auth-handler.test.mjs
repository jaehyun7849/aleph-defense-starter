import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAuthHandler } from '../src/auth-handler.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; },
    end() { return this; } };
}
const req = body => ({ method: 'POST', headers: {
  host: 'example.vercel.app', origin: 'https://example.vercel.app', 'content-type': 'application/json'
}, body });

test('auth isolates SDK clients, limits response fields, refreshes and revokes only local session', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder';
  const calls = [];
  let clients = 0;
  const session = { access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 2000000000,
    user: { id: 'test-id', email: 'test@example.invalid', app_metadata: { secret: 'omit' } }, provider_token: 'omit' };
  const handler = createAuthHandler((url, key, options) => {
    ++clients;
    assert.equal(key, 'test-only-placeholder');
    assert.equal(options.auth.persistSession, false);
    return { auth: {
      signInWithPassword: async value => { calls.push(value); return { data: { session } }; },
      refreshSession: async value => { calls.push(value); return { data: { session } }; },
      admin: { signOut: async (...value) => { calls.push(value); return {}; } }
    } };
  });
  const login = response();
  await handler(req({ action: 'login', email: 'test@example.invalid', password: 'test-password' }), login);
  assert.equal(login.code, 200);
  assert.deepEqual(Object.keys(login.body.session.user), ['id', 'email']);
  assert.equal(login.body.session.provider_token, undefined);
  assert.equal(JSON.stringify(login.body).includes('test-only-placeholder'), false);
  const refresh = response();
  await handler(req({ action: 'refresh', refresh_token: 'test-refresh' }), refresh);
  assert.equal(refresh.code, 200);
  const logout = response();
  await handler(req({ action: 'logout', access_token: 'test-access' }), logout);
  assert.equal(logout.code, 204);
  assert.deepEqual(calls.at(-1), ['test-access', 'local']);
  assert.equal(clients, 3);
  assert.equal(login.headers['Cache-Control'], 'no-store');
});

test('auth rejects malformed, cross-origin and unsupported requests before SDK; errors disclose no credentials', async () => {
  const handler = createAuthHandler(() => { throw new Error('must not call'); });
  for (const [request, expected] of [
    [{ ...req({}), method: 'GET' }, 405],
    [{ ...req({}), headers: { ...req({}).headers, origin: 'https://other.invalid' } }, 403],
    [{ ...req({}), headers: { ...req({}).headers, 'content-type': 'text/plain' } }, 415],
    [req('{'), 400], [req({ action: 'login', email: 'x', password: '' }), 400],
    [req({ action: 'refresh', refresh_token: 1 }), 400]
  ]) {
    const res = response(); await handler(request, res); assert.equal(res.code, expected);
  }
  const rejected = createAuthHandler(() => ({ auth: { signInWithPassword: async () => ({
    error: { message: 'test-password private server message' }, data: {} }) } }));
  const res = response(); await rejected(req({ action: 'login', email: 'x', password: 'test-password' }), res);
  assert.equal(res.code, 401);
  assert.equal(JSON.stringify(res.body).includes('test-password'), false);
});

async function browser() {
  const saved = new Map();
  globalThis.sessionStorage = { getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const module = await import('../public/auth-client.js');
  return { auth: module.createBrowserAuth(), saved };
}
const session = (access, expired = false) => ({ access_token: access, refresh_token: 'test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + (expired ? -10 : 3600), user: { id: 'test-id' } });
test('browser login, reload, single concurrent refresh and logout use server routes only', async () => {
  const { auth, saved } = await browser();
  const requests = [];
  globalThis.fetch = async (path, options) => {
    assert.equal(path, '/api/auth');
    const body = JSON.parse(options.body); requests.push(body.action);
    return new Response(body.action === 'logout' ? null
      : JSON.stringify({ session: session(body.action, body.action === 'login') }),
    { status: body.action === 'logout' ? 204 : 200 });
  };
  assert.equal((await auth.signInWithPassword({ email: 'test@example.invalid', password: 'test-password' })).error, null);
  const [a, b] = await Promise.all([auth.getSession(), auth.getSession()]);
  assert.equal(a.data.session.access_token, 'refresh');
  assert.equal(b.data.session.access_token, 'refresh');
  assert.deepEqual(requests, ['login', 'refresh']);
  assert.equal((await (await import('../public/auth-client.js')).createBrowserAuth().getSession()).data.session.access_token, 'refresh');
  assert.equal([...saved.values()].join('').includes('test-password'), false);
  await auth.signOut();
  assert.equal((await auth.getSession()).data.session, null);
  assert.equal(saved.size, 0);
});

test('late refresh cannot restore a session after logout', async () => {
  const { auth } = await browser();
  let complete;
  globalThis.fetch = async (_path, options) => {
    const body = JSON.parse(options.body);
    if (body.action === 'refresh') return new Promise(resolve => { complete = resolve; });
    return new Response(body.action === 'logout' ? null : JSON.stringify({ session: session('login', true) }),
      { status: body.action === 'logout' ? 204 : 200 });
  };
  await auth.signInWithPassword({ email: 'test@example.invalid', password: 'test-password' });
  const pending = auth.getSession();
  await auth.signOut();
  complete(new Response(JSON.stringify({ session: session('late') })));
  await pending;
  assert.equal((await auth.getSession()).data.session, null);
});

test('static pages have no provider keys or direct SDK/data calls; metadata preserves routes', async () => {
  for (const name of ['index.html', 'owner-check.html', 'auth-client.js']) {
    const source = await readFile(new URL('../public/' + name, import.meta.url), 'utf8');
    assert.equal(/sb_(publishable|secret)_|supabase\.co|cdn\.jsdelivr|\.from\(/.test(source), false, name);
  }
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const identity = deploymentIdentity({ VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'jaehyun7849',
    VERCEL_GIT_REPO_SLUG: 'aleph-defense-starter', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
    VERCEL_URL: 'test.vercel.app' }, config);
  assert.deepEqual(identity.allowedRoutes, config.allowedRoutes);
  assert.equal(identity.step, 5);
  assert.equal(identity.originalApiUrl, config.originalApiUrl);
});
