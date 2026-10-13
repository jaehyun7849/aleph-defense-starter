export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idText = value => typeof value === 'string' && value.length > 0 && value.length <= 200;

// Operator-owned server configuration. Never populate this from headers,
// request bodies, user_metadata, or a browser-provided role.
export function readResourcePolicy(raw = process.env.VAULT_RESOURCE_POLICY) {
  const value = raw === undefined ? { noticeIds: [], instructorUserIds: [], subjects: [] } : JSON.parse(raw);
  if (!isObject(value) || Object.keys(value).some(key => !['noticeIds', 'instructorUserIds', 'subjects'].includes(key))
      || !Array.isArray(value.noticeIds) || !Array.isArray(value.instructorUserIds) || !Array.isArray(value.subjects)
      || value.noticeIds.some(id => typeof id !== 'string' || !UUID.test(id))
      || value.instructorUserIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
    throw new TypeError('invalid_resource_policy');
  }
  const seen = new Set();
  for (const item of value.subjects) {
    if (!isObject(item) || Object.keys(item).sort().join(',') !== 'classId,projectId,subjectId,userId'
        || ![item.classId, item.projectId, item.subjectId].every(idText)
        || typeof item.userId !== 'string' || !UUID.test(item.userId)) throw new TypeError('invalid_resource_policy');
    const key = JSON.stringify([item.classId, item.projectId, item.subjectId]);
    if (seen.has(key)) throw new TypeError('invalid_resource_policy');
    seen.add(key);
  }
  return {
    noticeIds: new Set(value.noticeIds.map(id => id.toLowerCase())),
    instructorUserIds: new Set(value.instructorUserIds.map(id => id.toLowerCase())),
    subjects: value.subjects,
  };
}

export function matchResourceRoute(path, method, { api = false } = {}) {
  if (typeof path !== 'string') return null;
  const prefix = api ? '/api' : '';
  const match = new RegExp(`^${prefix}/(notes|notices)(?:/([^/]+))?/?$`).exec(path);
  if (!match || (match[2] && !UUID.test(match[2]))) return null;
  const collection = !match[2];
  if (!(collection ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE']).includes(method)) return null;
  return {
    kind: match[1] === 'notes' ? 'personal_note' : 'instructor_notice',
    id: match[2]?.toLowerCase() ?? null, collection,
    route: `${method} /${match[1]}${collection ? '' : '/:id'}`,
  };
}

export const resourceKind = (id, policy) => policy.noticeIds.has(id.toLowerCase())
  ? 'instructor_notice' : 'personal_note';
export const resourceId = (kind, id) => `${kind}:${id.toLowerCase()}`;

export function canAccessResource({ userId, isInstructor, resource, method }) {
  if (!UUID.test(userId ?? '') || !resource) return false;
  if (resource.kind === 'instructor_notice') return method === 'GET' || isInstructor === true;
  return resource.kind === 'personal_note' && typeof resource.ownerUserId === 'string'
    && resource.ownerUserId.toLowerCase() === userId.toLowerCase();
}
