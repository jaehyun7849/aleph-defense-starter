import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {join,dirname,basename,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {restoreTrialPolicy} from '../src/policy-restore.mjs';

const parent=dirname(fileURLToPath(import.meta.url)), roots=[];
const hash=data=>createHash('sha256').update(data).digest('hex');
after(async()=>{
  for(const dir of roots) {
    const target=resolve(dir);
    assert.equal(dirname(target),resolve(parent));
    assert.ok(basename(target).startsWith('.policy-restore-test-'));
    assert.equal((await lstat(target)).isSymbolicLink(),false);
    await rm(target,{recursive:true});
  }
});
async function fixture() {
  const root=await mkdtemp(join(parent,'.policy-restore-test-'));roots.push(root);
  const trialDir=join(root,'trial');await mkdir(join(trialDir,'src'),{recursive:true});
  await writeFile(join(trialDir,'.aleph-policy-trial.json'),JSON.stringify({schema:'aleph.policy.trial.v1',isolated:true}));
  const source=resolve(parent,'../src'), files={'aleph.config.json':'{"step":8}\n'};
  for(const path of ['decider.mjs','resource-policy.mjs','engine-resource-grants.mjs']) {
    const content=await readFile(join(source,path),'utf8');
    await writeFile(join(trialDir,'src',path),content);
    if(path!=='resource-policy.mjs')files[`src/${path}`]=content;
  }
  const grantPath=join(trialDir,'src/engine-resource-grants.mjs');
  const safeGrant=files['src/engine-resource-grants.mjs'];
  const corrupt=safeGrant.replace('request[field] === resource[field]','true');
  assert.notEqual(corrupt,safeGrant);
  await writeFile(grantPath,corrupt);
  await writeFile(join(trialDir,'aleph.config.json'),'{"step":9}\n');
  await writeFile(join(trialDir,'other-service.json'),'{"rules":["keep_other_service"]}\n');
  await writeFile(join(trialDir,'audit.log'),'keep_existing_history\n');
  await writeFile(join(trialDir,'.aleph-policy-restores.jsonl'),'keep_prior_restore_history\n');
  const bytes=Buffer.from(JSON.stringify({schema:'aleph.safe-policy.v1',version:'a'.repeat(40),files}));
  const backupPath=join(root,'safe.json');await writeFile(backupPath,bytes);
  return {root,grantPath,corrupt,args:{backupPath,expectedSha256:hash(bytes),expectedVersion:'a'.repeat(40),trialDir}};
}
function decisions(trialDir) {
  const module=pathToFileURL(join(trialDir,'src/decider.mjs')).href;
  const code=`import {decide} from ${JSON.stringify(module)};
    const request={schema:'aleph.decision.v1',requestId:'fixture-request',classId:'class_fixture',projectId:'project_fixture',
      subjectId:'learner_fixture',deviceId:'aaaaaaaaaaaaaaaa',deviceRegistered:true,service:'notes',
      method:'GET',path:'/notes/demo',route:'GET /notes/:id',queryLength:0};
    const a=await decide(request), b=await decide({...request,subjectId:'other_fixture'});
    console.log(JSON.stringify({A:a.decision,B:b.decision}));`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',windowsHide:true});
  assert.equal(child.status,0,child.stderr);
  return JSON.parse(child.stdout);
}
test('preview then confirmed restore fixes B access while preserving A, other services and audit history',async()=>{
  const {args,grantPath,corrupt}=await fixture();
  assert.deepEqual(decisions(args.trialDir),{A:'allow',B:'allow'});
  const before={};
  for(const path of ['src/decider.mjs','aleph.config.json','other-service.json','audit.log'])before[path]=await readFile(join(args.trialDir,path));
  const preview=await restoreTrialPolicy(args);
  assert.equal(preview.applied,false);assert.deepEqual(preview.scope,['src/engine-resource-grants.mjs']);
  assert.equal(await readFile(grantPath,'utf8'),corrupt);
  const result=await restoreTrialPolicy({...args,confirmPlanSha256:preview.planSha256});
  assert.equal(result.applied,true);
  assert.deepEqual(decisions(args.trialDir),{A:'allow',B:'deny'});
  for(const [path,bytes]of Object.entries(before))assert.deepEqual(await readFile(join(args.trialDir,path)),bytes);
  const history=await readFile(join(args.trialDir,'.aleph-policy-restores.jsonl'),'utf8');
  assert.ok(history.startsWith('keep_prior_restore_history\n'));
  assert.ok(history.includes('"outcome":"applied"'));
  assert.ok(!history.includes('learner_fixture'));
});
test('wrong or stale confirmation and changed backup all stop without restoring',async()=>{
  const {args,grantPath,corrupt}=await fixture();
  const preview=await restoreTrialPolicy(args);
  await assert.rejects(restoreTrialPolicy({...args,confirmPlanSha256:'b'.repeat(64)}),/restore_plan_confirmation_mismatch/);
  assert.equal(await readFile(grantPath,'utf8'),corrupt);
  await writeFile(grantPath,corrupt+'\n');
  await assert.rejects(restoreTrialPolicy({...args,confirmPlanSha256:preview.planSha256}),/restore_plan_confirmation_mismatch/);
  await writeFile(args.backupPath,'{}');
  await assert.rejects(restoreTrialPolicy(args),/safe_policy_hash_mismatch/);
});
test('production-shaped directories and multi-service grant modules are rejected',async()=>{
  const a=await fixture();await mkdir(join(a.args.trialDir,'api'));
  await assert.rejects(restoreTrialPolicy(a.args),/not_isolated_trial/);
  const b=await fixture();await writeFile(b.grantPath,b.corrupt+"\nconst other={service:'mail'};\n");
  await assert.rejects(restoreTrialPolicy(b.args),/unsupported_restore_scope/);
});
