import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotesHandler } from '../src/notes-handler.mjs';
import { createDecider } from '../src/decider.mjs';
import { createEngineResourceResolver } from '../src/engine-resource-context.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { createFixtureDecider, FIXTURE_USER_A as A, FIXTURE_USER_B as B,
  FIXTURE_NOTE_ID as NOTE, FIXTURE_NOTICE_ID as NOTICE } from '../scripts/fixture-resource-context.mjs';

function fakeDatabase() {
  const rows = [{ id: NOTE, owner_id: A, title: 'A fixture', body: 'private fixture' },
    { id: NOTICE, owner_id: A, title: 'notice fixture', body: 'shared fixture' }];
  let writes = 0;
  return { rows, get writes() { return writes; }, from(table) {
    assert.equal(table, 'notes');
    let filters = [], columns, action, payload;
    const execute = () => {
      let found = rows.filter(row => filters.every(filter => filter(row)));
      if (action === 'insert') {
        if (rows.some(row => row.id === payload.id)) return { data: null, error: { code: '23505' } };
        rows.push(payload); found = [payload]; writes++;
      }
      if (action === 'update') { found.forEach(row => Object.assign(row, payload)); writes++; }
      if (action === 'delete') { found.forEach(row => rows.splice(rows.indexOf(row), 1)); writes++; }
      return { data: found.map(row => Object.fromEntries((columns || 'id').split(',').map(key => [key, row[key]]))), error: null };
    };
    const query = {
      select(value) { columns = value; return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      not(key, operator, value) { assert.equal(operator, 'in'); const ids = value.slice(1, -1).split(','); filters.push(row => !ids.includes(row[key])); return query; },
      order() { return Promise.resolve(execute()); },
      insert(value) { action = 'insert'; payload = value; return query; },
      update(value) { action = 'update'; payload = value; return query; },
      delete() { action = 'delete'; return query; },
      async maybeSingle() { const r = execute(); return { ...r, data: r.data?.[0] ?? null }; },
      async single() { return query.maybeSingle(); },
    };
    return query;
  } };
}

function harness({ configured = true } = {}) {
  const db = fakeDatabase();
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SECRET_KEY: 'fixture-only',
    ...(configured ? { VAULT_RESOURCE_POLICY: JSON.stringify({ noticeIds: [NOTICE], instructorUserIds: [B], subjects: [] }) } : {}) };
  const handler = createNotesHandler({ env, createClient: () => db,
    verifyLogin: async token => token === 'fixture-a' ? { userId: A }
      : token === 'fixture-b' ? { userId: B } : null });
  const call = async (method, path, actor = 'fixture-a', body) => {
    const headers = {};
    const res = { setHeader(key, value) { headers[key] = value; },
      status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, end() { return this; } };
    await handler({ method, url: path, headers: actor ? { authorization: actor } : {}, body }, res);
    return { code: res.code, data: res.data, headers };
  };
  return { db, call };
}

test('dynamic function URLs preserve own CRUD and reject foreign resources and selectors', async () => {
  const { call } = harness();
  const rewritten = `/api/notes/[id]?id=${NOTE}`;
  const captured = `/api/notes/${NOTE}?id=${NOTE}`;
  assert.equal((await call('GET', rewritten)).code, 200);
  assert.equal((await call('GET', captured)).code, 200);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const result = await call(method, rewritten, 'fixture-b',
      method === 'PUT' ? { title: 'attempt', body: 'attempt' } : undefined);
    assert.equal(result.code, 404);
    assert.equal(result.data.reasonCode, 'resource_forbidden');
  }
  for (const path of [
    `/api/notes?id=${NOTE}`, `/api/notes/${NOTE}?id=${NOTICE}`,
    `${rewritten}&id=${NOTE}`, `${rewritten}&role=instructor`,
    '/api/notes/[id]?id=export', '/api/notes/[id]',
  ]) assert.equal((await call('GET', path)).data.reasonCode, 'resource_not_allowed');
  assert.equal((await call('PUT', rewritten, 'fixture-a', {
    title: 'attempt', body: 'attempt', owner_id: B,
  })).code, 403);
  assert.equal((await call('PUT', rewritten, 'fixture-a', {
    title: 'updated fixture', body: 'updated fixture',
  })).code, 200);
  assert.equal((await call('GET', captured)).data.body, 'updated fixture');
  assert.equal((await call('GET', `/api/notices/[id]?id=${NOTICE}`)).code, 200);
  assert.equal((await call('PUT', `/api/notices/[id]?id=${NOTICE}`, 'fixture-a', {
    title: 'attempt', body: 'attempt', role: 'instructor',
  })).code, 403);
  assert.equal((await call('DELETE', rewritten)).code, 204);
  assert.equal((await call('GET', rewritten)).code, 404);
});

test('API resources keep old memo addresses and distinguish notice IDs without changing rows', async () => {
  const { call, db } = harness();
  const before = structuredClone(db.rows);
  const list = await call('GET', '/api/notes');
  assert.deepEqual(list.data.map(row => row.id), [NOTE]);
  assert.equal(list.data[0].resourceId, `personal_note:${NOTE}`);
  const memo = await call('GET', `/api/notes/${NOTE}`);
  assert.equal(memo.code, 200);
  const oldNotice = await call('GET', `/api/notes/${NOTICE}`);
  const newNotice = await call('GET', `/api/notices/${NOTICE}`);
  assert.equal(oldNotice.data.resourceId, `instructor_notice:${NOTICE}`);
  assert.deepEqual(oldNotice.data, newNotice.data);
  assert.deepEqual(db.rows, before);
});

test('API rejects B reading/updating/deleting A memo and never lists A memo for B', async () => {
  const { call, db } = harness();
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const result = await call(method, `/api/notes/${NOTE}`, 'fixture-b',
      method === 'PUT' ? { title: 'attempt', body: 'attempt', role: 'instructor', owner_id: B } : undefined);
    assert.equal(result.code, 404);
    assert.equal(result.data.reasonCode, 'resource_forbidden');
    assert.equal(result.data.body, undefined);
  }
  assert.deepEqual((await call('GET', '/api/notes', 'fixture-b')).data, []);
  assert.equal(db.writes, 0);
});

test('API notice owner still cannot write as a student or self-promote with body role', async () => {
  const { call, db } = harness();
  for (const path of [`/api/notes/${NOTICE}`, `/api/notices/${NOTICE}`]) {
    const result = await call('PUT', path, 'fixture-a', { title: 'attempt', body: 'attempt', role: 'instructor' });
    assert.equal(result.code, 403);
    assert.equal(result.data.reasonCode, 'resource_forbidden');
  }
  assert.equal(db.writes, 0);
  const allowed = await call('PUT', `/api/notices/${NOTICE}`, 'fixture-b', { title: 'updated', body: 'updated' });
  assert.equal(allowed.code, 200);
  assert.equal(allowed.data.resourceId, `instructor_notice:${NOTICE}`);
});

test('API rejects query selectors, function routes, unknown resources and unauthenticated reads', async () => {
  const { call, db } = harness();
  for (const path of ['/api/notes/export', `/api/notes/${NOTE}/export`, '/api/notes?owner_id=other',
    `/api/notes/${NOTE}?action=export`, `/api/notices/${NOTE}`]) {
    assert.equal((await call('GET', path)).code, 404);
  }
  assert.equal((await call('GET', '/api/notes', null)).code, 401);
  assert.equal(db.writes, 0);
});

test('default policy preserves all original memos and grants nobody instructor permission', async () => {
  const { call } = harness({ configured: false });
  assert.equal((await call('GET', '/api/notes')).data.length, 2);
  assert.deepEqual((await call('GET', '/api/notices')).data, []);
  assert.equal((await call('POST', '/api/notices', 'fixture-a', { id: NOTICE, title: 'attempt', body: 'attempt' })).code, 403);
  assert.equal((await call('PUT', `/api/notes/${NOTE}`, 'fixture-a', { title: 'own', body: 'own' })).code, 200);
});

test('personal CRUD preserves ownership and client resource labels cannot change classification', async () => {
  const { call } = harness();
  const id = '00000000-0000-4000-8000-000000000033';
  const created = await call('POST', '/api/notes', 'fixture-a', {
    id, title: 'new', body: 'new', role: 'instructor', resourceId: `instructor_notice:${id}`,
  });
  assert.equal(created.code, 201);
  assert.equal(created.data.resourceId, `personal_note:${id}`);
  assert.equal((await call('PUT', `/api/notes/${id}`, 'fixture-a', { title: 'own', body: 'own' })).code, 200);
  assert.equal((await call('GET', `/api/notes/${id}`, 'fixture-b')).code, 404);
  assert.equal((await call('DELETE', `/api/notes/${id}`, 'fixture-a')).code, 204);
  assert.equal((await call('GET', `/api/notes/${id}`)).code, 404);
  assert.equal((await call('POST', '/api/notes', 'fixture-a', { id: NOTICE, title: 'fake', body: 'fake' })).code, 403);
});

test('shared notice lists never contain private memos', async () => {
  const { call } = harness();
  const list = await call('GET', '/api/notices', 'fixture-a');
  assert.deepEqual(list.data.map(row => row.id), [NOTICE]);
  assert.equal(list.data[0].resourceId, `instructor_notice:${NOTICE}`);
});

test('decider allows A memo, denies B memo and student notice writes, allows registered instructor', async () => {
  const decide = createFixtureDecider();
  const { normal } = fixtureRequests();
  assert.equal((await decide(normal)).decision, 'allow');
  assert.equal((await decide({ ...normal, subjectId: 'other_fixture' })).reasonCode, 'resource_forbidden');
  const edit = { ...normal, path: `/notices/${NOTICE}`, route: 'PUT /notices/:id', method: 'PUT' };
  assert.equal((await decide(edit)).decision, 'deny');
  assert.equal((await decide({ ...edit, subjectId: 'instructor_fixture' })).decision, 'allow');
  assert.equal((await decide({ ...edit, subjectId: 'instructor_fixture', deviceRegistered: false })).reasonCode, 'device_not_registered');
  assert.equal((await decide({ ...normal, path: '/notes/export' })).reasonCode, 'resource_not_allowed');
  assert.equal((await decide({ ...normal, queryLength: 10 })).decision, 'deny');
  assert.equal((await decide({ ...normal, service: 'other' })).decision, 'deny');
});

test('engine resolver requires explicit class/project/subject binding and a stored owner', async () => {
  const db = fakeDatabase();
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SECRET_KEY: 'fixture-only' };
  const resolver = createEngineResourceResolver({ createClient: () => db, env });
  const decide = createDecider({ resolveResource: resolver });
  const { normal } = fixtureRequests();
  normal.path = `/notes/${NOTE}`;
  assert.equal((await decide(normal)).decision, 'deny');
  env.VAULT_RESOURCE_POLICY = JSON.stringify({ noticeIds: [NOTICE], instructorUserIds: [], subjects: [
    { classId: normal.classId, projectId: normal.projectId, subjectId: normal.subjectId, userId: A },
  ] });
  assert.equal((await decide(normal)).decision, 'allow');
  assert.equal((await decide({ ...normal, projectId: 'different_project' })).decision, 'deny');
  env.VAULT_RESOURCE_POLICY = '{}';
  assert.equal((await decide(normal)).decision, 'deny');
});
