import { readFile, lstat, stat, open, writeFile, rename, unlink, appendFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { previewPolicy } from './policy-preview.mjs';

const targetPath = 'src/engine-resource-grants.mjs';
const digest = data => createHash('sha256').update(data).digest('hex');
const fail = code => { throw new Error(code); };
async function exists(path) {
  try { await lstat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
async function trialRoot(dir) {
  if (typeof dir !== 'string' || !dir) fail('trial_policy_directory_required');
  const root = resolve(dir);
  if ((await lstat(root)).isSymbolicLink() || !(await stat(root)).isDirectory()) fail('not_isolated_trial');
  for (const item of ['.git', 'api', 'public']) if (await exists(join(root,item))) fail('not_isolated_trial');
  const markerPath = join(root,'.aleph-policy-trial.json');
  if ((await lstat(markerPath)).isSymbolicLink()) fail('not_isolated_trial');
  const marker = JSON.parse(await readFile(markerPath,'utf8'));
  if (marker?.schema !== 'aleph.policy.trial.v1' || marker?.isolated !== true) fail('not_isolated_trial');
  return root;
}
function notesOnly(text) {
  // This procedure supports the current notes-only grant module, not a generic
  // service registry. Refuse a multi-service module rather than overwrite it.
  const services = [...text.matchAll(/\bservice\s*:\s*(['"])([^'"]+)\1/g)].map(m=>m[2]);
  if (!services.length || services.some(service=>service!=='notes')) fail('unsupported_restore_scope');
}
async function plan(options) {
  const root = await trialRoot(options.trialDir);
  const preview = await previewPolicy({...options,trialDir:root});
  if (!preview.scope.includes(targetPath)) fail('safe_notes_policy_missing');
  const bytes = await readFile(options.backupPath);
  if (digest(bytes) !== preview.verifiedSnapshotSha256) fail('safe_policy_hash_mismatch');
  const safeText = JSON.parse(bytes.toString('utf8')).files[targetPath];
  const current = await readFile(join(root,targetPath));
  notesOnly(safeText); notesOnly(current.toString('utf8'));
  const change = preview.changes.find(change=>change.path===targetPath);
  if (change && change.operation !== 'replace') fail('unsupported_restore_scope');
  const publicPlan = { schema:'aleph.policy.restore-plan.v1',mode:'trial_only',
    trialId:digest(root),restoreVersion:preview.restoreVersion,
    verifiedSnapshotSha256:preview.verifiedSnapshotSha256,
    scope:[targetPath],changes:change?[change]:[],
    preservedSnapshotFiles:preview.scope.filter(path=>path!==targetPath),applied:false };
  return {root,current,safeText,publicPlan,planSha256:digest(JSON.stringify(publicPlan))};
}
export async function restoreTrialPolicy(options) {
  const prepared = await plan(options);
  const result = {...prepared.publicPlan,planSha256:prepared.planSha256};
  if (!options.confirmPlanSha256) return result;
  if (options.confirmPlanSha256 !== prepared.planSha256) fail('restore_plan_confirmation_mismatch');
  if (!result.changes.length) return {...result,mode:'no_changes'};
  const lockPath = join(prepared.root,'.aleph-policy-restore.lock');
  let lock;
  try { lock = await open(lockPath,'wx'); } catch { fail('trial_restore_busy'); }
  const auditPath = join(prepared.root,'.aleph-policy-restores.jsonl');
  const tempPath = join(prepared.root,'src',`.aleph-restore-${randomUUID()}.tmp`);
  let changed = false;
  try {
    const fresh = await plan(options);
    if (fresh.planSha256 !== options.confirmPlanSha256) fail('restore_plan_stale');
    if (await exists(auditPath)) {
      const info = await lstat(auditPath);
      if (info.isSymbolicLink() || !info.isFile()) fail('invalid_trial_audit');
    }
    const record = {at:new Date().toISOString(),version:fresh.publicPlan.restoreVersion,
      planSha256:fresh.planSha256,paths:[targetPath]};
    await appendFile(auditPath,JSON.stringify({...record,outcome:'started'})+'\n',{encoding:'utf8',flag:'a'});
    await writeFile(tempPath,fresh.safeText,{encoding:'utf8',flag:'wx'});
    // Recheck content immediately before the single-file atomic replacement.
    const beforeWrite = await plan(options);
    if (beforeWrite.planSha256 !== fresh.planSha256) fail('restore_plan_stale');
    await rename(tempPath,join(fresh.root,targetPath));
    changed = true;
    await appendFile(auditPath,JSON.stringify({...record,outcome:'applied'})+'\n',{encoding:'utf8',flag:'a'});
    return {...result,mode:'trial_applied',applied:true,auditFile:'.aleph-policy-restores.jsonl'};
  } catch (error) {
    if (changed) {
      try {
        await writeFile(tempPath,prepared.current,{flag:'wx'});
        await rename(tempPath,join(prepared.root,targetPath));
      } catch { fail('trial_restore_rollback_failed'); }
    }
    throw error;
  } finally {
    try { await unlink(tempPath); } catch (e) { if (e.code!=='ENOENT') throw e; }
    await lock.close();
    await unlink(lockPath);
  }
}
