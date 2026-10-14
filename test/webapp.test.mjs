import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = name => readFile(new URL('../public/' + name, import.meta.url), 'utf8');

test('manifest launches the existing app and its declared PNG icons have the correct dimensions', async () => {
  const manifest = JSON.parse(await source('manifest.webmanifest'));
  assert.equal(manifest.name, 'BYTE BACK 내 자료실');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL('../public' + icon.src, import.meta.url));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(icon.sizes, `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`);
  }
});

test('connectivity and installation events cannot promote the unknown device status or alter authentication', async () => {
  const nodes = Object.fromEntries(['connection-status', 'device-status', 'offline-capability'].map(id => [id, { textContent: '' }]));
  const events = new Map();
  nodes['device-status'].textContent = '기기 승인: 확인 정보 없음';
  const registrations = [];
  const navigator = { onLine: true, serviceWorker: { register: async (...args) => registrations.push(args) } };
  runInNewContext(await source('app-status.js'), {
    document: { querySelector: selector => nodes[selector.slice(1)] }, navigator,
    window: { addEventListener: (name, callback) => events.set(name, callback) },
  });
  assert.equal(nodes['device-status'].textContent, '기기 승인: 확인 정보 없음');
  navigator.onLine = false; events.get('offline')();
  assert.match(nodes['connection-status'].textContent, /오프라인/);
  assert.equal(nodes['device-status'].textContent, '기기 승인: 확인 정보 없음');
  navigator.onLine = true; events.get('online')();
  assert.equal(nodes['device-status'].textContent, '기기 승인: 확인 정보 없음');
  assert.equal(events.has('appinstalled'), false);
  assert.equal(registrations[0][0], '/sw.js');
  const html = await source('index.html');
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /앱 설치나 로그인만으로 기기 승인이 완료되지는 않습니다/);
  assert.match(html, /cache: 'no-store'/);
});

async function worker() {
  const handlers = new Map();
  const added = [], cached = [];
  let onlineResult = new Response('online', { status: 200 }), networkFails = false;
  const cache = { add: async request => added.push(request.url), match: async path => {
    cached.push(path); return new Response(await source('offline.html'), { headers: { 'Content-Type': 'text/html' } });
  } };
  // Resolve only the fixed public notice request, just as a browser worker does.
  class WorkerRequest { constructor(path) { this.url = new URL(path, 'https://vault.invalid').href; } }
  runInNewContext(await source('sw.js'), {
    self: { location: { origin: 'https://vault.invalid' }, clients: { claim: async () => {} },
      addEventListener: (name, callback) => handlers.set(name, callback) },
    caches: { open: async () => cache }, URL, Request: WorkerRequest, Response,
    fetch: async () => { if (networkFails) throw new Error('offline'); return onlineResult; },
  });
  async function navigate(path, extra = {}) {
    let response;
    handlers.get('fetch')({ request: { url: new URL(path, 'https://vault.invalid').href,
      method: 'GET', mode: 'navigate', ...extra }, respondWith: promise => { response = promise; } });
    return response === undefined ? undefined : await response;
  }
  return { handlers, added, cached, navigate, offline: () => { networkFails = true; },
    reply: response => { onlineResult = response; } };
}

test('offline cache contains only the public notice and never intercepts protected or non-navigation requests', async () => {
  const w = await worker();
  let installation;
  w.handlers.get('install')({ waitUntil: promise => { installation = promise; } });
  await installation;
  assert.deepEqual(w.added, ['https://vault.invalid/offline.html']);
  w.offline();
  for (const path of ['/api/auth', '/api/notes', '/api/notes/demo', '/api/notices', '/api/restore-note',
    '/data.json', '/owner-check.html', '/?private=selector', 'https://database.invalid/rest/v1/notes']) {
    assert.equal(await w.navigate(path), undefined, path);
  }
  assert.equal(await w.navigate('/', { method: 'POST' }), undefined);
  assert.equal(await w.navigate('/', { mode: 'cors' }), undefined);
  assert.deepEqual(w.cached, []);
  const notice = await w.navigate('/');
  assert.match(await notice.text(), /지금은 연결할 수 없습니다/);
  assert.deepEqual(w.cached, ['/offline.html']);
});

test('successful network navigation and HTTP denial responses are never replaced by cached content', async () => {
  const w = await worker();
  for (const status of [200, 401, 403, 404, 503]) {
    const original = new Response('network response', { status });
    w.reply(original);
    assert.equal(await w.navigate('/'), original);
  }
  assert.deepEqual(w.cached, []);
});
