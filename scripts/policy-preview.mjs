import { previewPolicy } from '../src/policy-preview.mjs';

try {
  const args = process.argv.slice(2);
  const known = new Set(['--backup', '--sha256', '--version', '--trial-dir']);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!known.has(args[i]) || options[args[i]] !== undefined || !args[i + 1]
        || args[i + 1].startsWith('--')) throw new Error('invalid_preview_arguments');
    options[args[i]] = args[i + 1];
  }
  const result = await previewPolicy({ backupPath: options['--backup'],
    expectedSha256: options['--sha256'], expectedVersion: options['--version'],
    trialDir: options['--trial-dir'] });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  // Fixed error codes only: no paths, source text, credentials or partial diff.
  const codes = new Set(['invalid_preview_arguments', 'safe_policy_verification_required',
    'safe_policy_copy_missing', 'trial_policy_directory_required', 'invalid_policy_file',
    'policy_read_failed', 'safe_policy_hash_mismatch', 'invalid_policy_snapshot',
    'safe_policy_version_mismatch', 'policy_contains_sensitive_values',
    'invalid_trial_directory', 'trial_policy_path_escape', 'trial_policy_read_failed']);
  process.stderr.write(`정책 비교 중단: ${codes.has(error.message) ? error.message : 'policy_preview_failed'}\n`);
  process.exitCode = 1;
}
