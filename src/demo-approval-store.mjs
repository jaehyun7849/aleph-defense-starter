export function createDemoStore(db) {
  const table = () => db.from('demo_device_approvals');
  const unwrap = result => { if (result.error) throw new Error('demo_store_failed'); return result.data; };
  return {
    async find(owner, hash) {
      return unwrap(await table().select('id,state,created_at').eq('owner_user_id', owner).eq('session_hash', hash).maybeSingle());
    },
    async request(row) {
      // One active demo page per account; a new page replaces its old handle.
      return unwrap(await table().upsert(row, { onConflict: 'owner_user_id' }).select('id,state,created_at').single());
    },
    async list() {
      return unwrap(await table().select('id,state,created_at').in('state', ['pending', 'approved'])
        .order('created_at', { ascending: false }).limit(100));
    },
    async transition(id, state, admin) {
      return unwrap(await table().update({ state, approved_by: admin }).eq('id', id)
        .in('state', state === 'approved' ? ['pending'] : ['pending', 'approved'])
        .select('id,state,created_at').maybeSingle());
    },
  };
}
