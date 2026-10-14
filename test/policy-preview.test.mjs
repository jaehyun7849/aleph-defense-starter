import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, rm, symlink } from 'node:fs/promises';
import { join, dirname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { previewPolicy } from '../src/policy-preview.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const version = 'a'.repeat(40);
const fixtureParent = dirname(fileURLToPath(import.meta.url));
const created = [];
after(async () => {
  const parent = resolve(fixtureParent);
  for (const path of created) {
    const target = resolve(path);
    assert.equal(dirname(target), parent);
    assert.ok(basename(target).startsWith('.policy-preview-test-'));
    assert.equal((await lstat(target)).isSymbolicLink(),false);
    await rm(target,{recursive:true});
  }
});
async function fixture() {
  const root = await mkdtemp(join(fixtureParent, '.policy-preview-test-'));
  created.push(root);
  const trialDir = join(root, 'trial');
  await mkdir(join(trialDir, 'src'), {recursive:true});
  const safe = {schema:'aleph.safe-policy.v1',version, files:{
    'aleph.config.json':'{"step":9}\n',
    'src/decider.mjs':'export const RULE_IDS = ["device_registered"];\n',
  }};
  await writeFile(join(trialDir,'aleph.config.json'),safe.files['aleph.config.json']);
  await writeFile(join(trialDir,'src/decider.mjs'),'export const RULE_IDS = [];\n');
  const backupPath = join(root,'safe.json');
  const bytes = Buffer.from(JSON.stringify(safe));
  await writeFile(backupPath,bytes);
  return {root, safe, args:{backupPath,trialDir,expectedSha256:digest(bytes),expectedVersion:version}};
}
test('preview shows the verified version and changed scope, leaves both copies and unrelated files untouched', async () => {
  const {args} = await fixture();
  const trial = join(args.trialDir,'src/decider.mjs');
  const before = await readFile(trial);
  const backupBefore = await readFile(args.backupPath);
  const namesBefore = await readdir(args.trialDir);
  const result = await previewPolicy(args);
  assert.equal(result.restoreVersion,version);
  assert.equal(result.applied,false);
  assert.deepEqual(result.scope,['aleph.config.json','src/decider.mjs']);
  assert.equal(result.changes.length,1);
  assert.equal(result.changes[0].path,'src/decider.mjs');
  assert.equal(result.changes[0].operation,'replace');
  assert.equal(result.changes[0].currentSha256,digest(before));
  assert.deepEqual(result.changes[0].changedLineRange,{before:{start:1,count:1},after:{start:1,count:1}});
  assert.deepEqual(await readFile(trial),before);
  assert.deepEqual(await readFile(args.backupPath),backupBefore);
  assert.deepEqual(await readdir(args.trialDir),namesBefore);
  assert.ok(!JSON.stringify(result).includes('export const'));
});
test('missing copy, missing independent verification, tampering and version mismatch all stop before output', async () => {
  const {args} = await fixture();
  await assert.rejects(previewPolicy({...args,backupPath:join(args.trialDir,'missing.json')}),/safe_policy_copy_missing/);
  await assert.rejects(previewPolicy({...args,expectedSha256:undefined}),/safe_policy_verification_required/);
  await assert.rejects(previewPolicy({...args,expectedVersion:'b'.repeat(40)}),/safe_policy_version_mismatch/);
  await writeFile(args.backupPath,'{}');
  await assert.rejects(previewPolicy(args),/safe_policy_hash_mismatch/);
});
test('unknown file paths and sensitive backup values stop; no source is executed', async () => {
  for (const change of [
    safe => {safe.files['../outside']='fixture';},
    safe => {safe.files['aleph.config.json']='{"email":"fixture@example.invalid"}';},
    safe => {safe.files['aleph.config.json']='null';},
  ]) {
    const {args,safe} = await fixture();
    change(safe);
    const bytes = Buffer.from(JSON.stringify(safe));
    await writeFile(args.backupPath,bytes);
    await assert.rejects(previewPolicy({...args,expectedSha256:digest(bytes)}),/invalid_policy_snapshot|policy_contains_sensitive_values/);
  }
  const {args,safe} = await fixture();
  safe.files['src/decider.mjs']='throw new Error("must not execute snapshot");';
  const bytes = Buffer.from(JSON.stringify(safe));
  await writeFile(args.backupPath,bytes);
  assert.equal((await previewPolicy({...args,expectedSha256:digest(bytes)})).applied,false);
});
test('CLI emits a preview only on success and fixed error codes with no partial JSON on verification failure', async () => {
  const {args} = await fixture();
  const script = fileURLToPath(new URL('../scripts/policy-preview.mjs',import.meta.url));
  const cliArgs = ['--backup',args.backupPath,'--sha256',args.expectedSha256,
    '--version',version,'--trial-dir',args.trialDir];
  const good = spawnSync(process.execPath,[script,...cliArgs],{encoding:'utf8',windowsHide:true});
  assert.equal(good.status,0,good.stderr);
  assert.equal(JSON.parse(good.stdout).restoreVersion,version);
  const bad = spawnSync(process.execPath,[script],{encoding:'utf8',windowsHide:true});
  assert.equal(bad.status,1);
  assert.equal(bad.stdout,'');
  assert.match(bad.stderr,/safe_policy_verification_required/);
  assert.ok(!bad.stderr.includes(args.backupPath));
});
test('unchanged files produce no diff and missing trial files are only shown as additions', async () => {
  const {args,safe,root} = await fixture();
  await writeFile(join(args.trialDir,'src/decider.mjs'),safe.files['src/decider.mjs']);
  assert.deepEqual((await previewPolicy(args)).changes,[]);
  const blank = join(root,'blank');
  await mkdir(blank);
  const result = await previewPolicy({...args,trialDir:blank});
  assert.equal(result.changes.length,2);
  assert.ok(result.changes.every(change=>change.operation==='add'));
  assert.deepEqual(await readdir(blank),[]);
});
test('a link inside the trial folder cannot redirect policy reads outside it', async t => {
  const {args,root} = await fixture();
  const linked = join(root,'linked');
  await mkdir(linked);
  await writeFile(join(linked,'aleph.config.json'),'{"step":9}\n');
  try {
    await symlink(join(args.trialDir,'src'),join(linked,'src'),process.platform==='win32'?'junction':'dir');
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'ENOSYS') throw error;
    t.skip('This environment cannot create links; the link-escape test was not executed.');
    return;
  }
  await assert.rejects(previewPolicy({...args,trialDir:linked}),/trial_policy_path_escape/);
});
