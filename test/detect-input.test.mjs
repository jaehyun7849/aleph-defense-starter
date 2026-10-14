import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, readDetectionEvents } from '../src/detect.mjs';

const event = () => ({ at: '2026-10-01T00:00:00.000Z', method: 'GET',
  identity: { sub: 'learner_fixture' } });

test('normal and suspicious teaching events can be read without changing detection decisions', () => {
  for (const count of [30, 200]) {
    const events = Array.from({ length: count }, (_, index) => ({ ...event(),
      at: new Date(Date.UTC(2026, 9, 1) + index * 2000).toISOString() }));
    const result = readDetectionEvents(events);
    assert.equal(result.length, count);
    assert.deepEqual(result[0], event());
    assert.deepEqual(detect(events), { action: 'observe' });
  }
  assert.deepEqual(readDetectionEvents([]), []);
  assert.equal(readDetectionEvents([{ ...event(), at: '2026-10-01T00:00:00Z' }])[0].at,
    '2026-10-01T00:00:00Z');
});

test('sensitive and uncontracted fields are never read or retained and input references are detached', () => {
  const original = event();
  const neverRead = { get() { throw new Error('Sensitive field was read'); }, enumerable: true };
  for (const key of ['body', 'content', 'token', 'headers', 'name', 'deviceId', 'decision']) {
    Object.defineProperty(original, key, neverRead);
  }
  for (const key of ['name', 'token', 'email']) Object.defineProperty(original.identity, key, neverRead);
  const result = readDetectionEvents([original]);
  assert.deepEqual(Object.keys(result[0]), ['at', 'method', 'identity']);
  assert.deepEqual(Object.keys(result[0].identity), ['sub']);
  assert.notEqual(result[0].identity, original.identity);
  original.identity.sub = 'other_fixture';
  assert.equal(result[0].identity.sub, 'learner_fixture');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result[0]) && Object.isFrozen(result[0].identity));
  assert.deepEqual(detect([original]), { action: 'observe' });
});

test('invalid or missing evidence is rejected with a fixed error instead of invented normal values', () => {
  const invalid = [null, {}, [null], [{ ...event(), identity: {} }],
    [{ ...event(), identity: { sub: '' } }], [{ ...event(), identity: { sub: ' learner_fixture' } }],
    [{ ...event(), at: '2026-02-30T00:00:00Z' }], [{ ...event(), at: 'invalid' }],
    [{ ...event(), method: 'UNKNOWN' }], [{ ...event(), at: undefined }]];
  for (const input of invalid) {
    assert.throws(() => detect(input), { name: 'TypeError', message: 'invalid_detection_events' });
  }
});
