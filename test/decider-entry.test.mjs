import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('exported decide preserves the supplied demo resource without a mocked resolver', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal(normal.path, '/notes/demo');
  assert.equal((await decide(normal)).decision, 'allow');
  assert.equal((await decide({ ...normal, method: 'PUT', route: 'PUT /notes/:id' })).decision, 'allow');
  assert.equal((await decide(suspicious)).decision, 'step_up');
  assert.equal((await decide({ ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } })).decision, 'allow');
  assert.equal((await decide({ ...normal, signals: { source: 'none', region: 'unknown', network: 'unknown' } })).decision, 'allow');
});

test('demo grant never extends to another subject, device, scope, resource or operation', async () => {
  const { normal } = fixtureRequests();
  const patches = [
    { subjectId: 'other_fixture' }, { subjectId: 'instructor_fixture' },
    { deviceId: 'bbbbbbbbbbbbbbbb' }, { classId: 'other_class' }, { projectId: 'other_project' },
    { deviceRegistered: false }, { deviceRegistered: undefined },
    { path: '/notes/other' }, { path: '/notes/export' },
    { path: '/notes', route: 'GET /notes' },
    { path: '/notices/demo', method: 'PUT', route: 'PUT /notices/:id' },
    { method: 'DELETE', route: 'DELETE /notes/:id' },
    { queryLength: 1 }, { service: 'other' }, { route: 'GET /notes' },
  ];
  for (const patch of patches) assert.equal((await decide({ ...normal, ...patch })).decision, 'deny', JSON.stringify(patch));
});
