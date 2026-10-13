import { readResourcePolicy, resourceKind } from './resource-policy.mjs';

// The class engine must verify the request before calling the decider.
// subjectId is NOT a Supabase user ID. This operator-owned mapping is explicit.
export function createEngineResourceResolver({ createClient, env = process.env }) {
  return async (request, route) => {
    const policy = readResourcePolicy(env.VAULT_RESOURCE_POLICY);
    const binding = policy.subjects.find(item => item.classId === request.classId
      && item.projectId === request.projectId && item.subjectId === request.subjectId);
    if (!binding) return null;
    const userId = binding.userId.toLowerCase();
    const isInstructor = policy.instructorUserIds.has(userId);
    if (route.collection) return { userId, isInstructor,
      resource: { kind: route.kind, ownerUserId: userId } };
    const kind = resourceKind(route.id, policy);
    // Legacy /notes/:id still addresses notices after an operator classifies
    // them. A /notices/:id request may never address an unclassified memo.
    if (route.kind === 'instructor_notice' && kind !== route.kind) return null;
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await db.from('notes').select('owner_id').eq('id', route.id).maybeSingle();
    if (error || !data) return null;
    return { userId, isInstructor, resource: { kind, ownerUserId: data.owner_id } };
  };
}
