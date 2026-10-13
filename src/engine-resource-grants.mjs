// Public teaching resource from the supplied scripts/fixture-7.mjs.
// These are resource grants, not Supabase users or instructor roles.
// A grant is independent of signals.source and runs through device/step-up checks.
// Real UUID resources continue to require the server-owned DB mapping.
const resources = Object.freeze([
  Object.freeze({
    resourceId: 'personal_note:demo', service: 'notes', path: '/notes/demo',
    route: '/notes/:id', methods: Object.freeze(['GET', 'PUT']),
    classId: 'class_fixture', projectId: 'project_fixture',
    subjectId: 'learner_fixture', deviceId: 'aaaaaaaaaaaaaaaa',
  }),
]);

export function registeredEngineResource(path) {
  return resources.find(resource => resource.path === path) ?? null;
}

export function hasEngineResourceGrant(request, resource) {
  return resource.methods.includes(request.method)
    && ['service', 'classId', 'projectId', 'subjectId', 'deviceId']
      .every(field => request[field] === resource[field]);
}
