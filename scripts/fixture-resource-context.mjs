import { createDecider } from '../src/decider.mjs';
export const FIXTURE_USER_A = '00000000-0000-4000-8000-000000000001';
export const FIXTURE_USER_B = '00000000-0000-4000-8000-000000000002';
export const FIXTURE_NOTE_ID = '00000000-0000-4000-8000-000000000011';
export const FIXTURE_NOTICE_ID = '00000000-0000-4000-8000-000000000012';

// Test-only context. Production decide never imports this fixture.
export async function fixtureResourceContext(request, route) {
  const userId = request.subjectId === 'learner_fixture' ? FIXTURE_USER_A
    : request.subjectId === 'other_fixture' ? FIXTURE_USER_B
    : request.subjectId === 'instructor_fixture' ? FIXTURE_USER_B : null;
  if (!userId) return null;
  const kind = route.id === FIXTURE_NOTICE_ID ? 'instructor_notice' : route.kind;
  if (route.id && ![FIXTURE_NOTE_ID, FIXTURE_NOTICE_ID].includes(route.id)) return null;
  if (route.kind === 'instructor_notice' && route.id && kind !== route.kind) return null;
  return { userId, isInstructor: request.subjectId === 'instructor_fixture',
    resource: { kind, ownerUserId: route.collection ? userId : FIXTURE_USER_A } };
}
export const createFixtureDecider = () => createDecider({ resolveResource: fixtureResourceContext });
