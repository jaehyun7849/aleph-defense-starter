import { restoreTrialPolicy } from '../src/policy-restore.mjs';
try {
  const argv=process.argv.slice(2),args={};
  const known=new Set(['--backup','--sha256','--version','--trial-dir','--confirm']);
  for(let i=0;i<argv.length;i+=2) {
    if(!known.has(argv[i])||args[argv[i]]!==undefined||!argv[i+1]||argv[i+1].startsWith('--')) throw new Error('invalid_restore_arguments');
    args[argv[i]]=argv[i+1];
  }
  const result=await restoreTrialPolicy({backupPath:args['--backup'],expectedSha256:args['--sha256'],
    expectedVersion:args['--version'],trialDir:args['--trial-dir'],confirmPlanSha256:args['--confirm']});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
} catch(error) {
  const codes=new Set(['invalid_restore_arguments','safe_policy_verification_required',
    'safe_policy_copy_missing','safe_policy_hash_mismatch','safe_policy_version_mismatch',
    'invalid_policy_snapshot','policy_contains_sensitive_values','trial_policy_path_escape',
    'trial_policy_directory_required','not_isolated_trial','safe_notes_policy_missing',
    'unsupported_restore_scope','restore_plan_confirmation_mismatch','restore_plan_stale',
    'trial_restore_busy','invalid_trial_audit','trial_restore_rollback_failed']);
  process.stderr.write(`시험 정책 복원 중단: ${codes.has(error.message)?error.message:'trial_restore_failed'}\n`);
  process.exitCode=1;
}
