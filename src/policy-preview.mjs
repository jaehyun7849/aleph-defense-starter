import { readFile, lstat, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';

const allowedFiles = new Set(['aleph.config.json', 'src/decider.mjs', 'src/detect.mjs',
  'src/engine-resource-grants.mjs', 'src/resource-policy.mjs', 'src/engine-resource-context.mjs']);
const sha256 = data => createHash('sha256').update(data).digest('hex');
const fail = code => { throw new Error(code); };
const secret = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

async function readBounded(path, missingCode) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) fail('invalid_policy_file');
    const bytes = await readFile(path);
    if (bytes.length > 2 * 1024 * 1024) fail('invalid_policy_file');
    return bytes;
  } catch (error) {
    if (error.code === 'ENOENT') fail(missingCode);
    if (['invalid_policy_file'].includes(error.message)) throw error;
    fail('policy_read_failed');
  }
}

function changedLines(before, after) {
  const a = before.split('\n'), b = after.split('\n');
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix
      && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++;
  return { before: { start: prefix + 1, count: a.length - prefix - suffix },
    after: { start: prefix + 1, count: b.length - prefix - suffix } };
}

// Read-only. The separately pinned hash proves integrity of a previously reviewed
// snapshot, not that an arbitrary file is safe. No baseline creation or apply API.
export async function previewPolicy({ backupPath, expectedSha256, expectedVersion, trialDir }) {
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedSha256)
      || typeof expectedVersion !== 'string' || !/^[a-f0-9]{40}$/i.test(expectedVersion)) {
    fail('safe_policy_verification_required');
  }
  if (typeof backupPath !== 'string' || !backupPath) fail('safe_policy_copy_missing');
  if (typeof trialDir !== 'string' || !trialDir) fail('trial_policy_directory_required');
  const bytes = await readBounded(backupPath, 'safe_policy_copy_missing');
  if (sha256(bytes) !== expectedSha256.toLowerCase()) fail('safe_policy_hash_mismatch');
  let snapshot;
  try { snapshot = JSON.parse(bytes.toString('utf8')); } catch { fail('invalid_policy_snapshot'); }
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object'
      || Object.keys(snapshot).sort().join(',') !== 'files,schema,version'
      || snapshot.schema !== 'aleph.safe-policy.v1') fail('invalid_policy_snapshot');
  if (snapshot.version !== expectedVersion.toLowerCase()) fail('safe_policy_version_mismatch');
  const files = snapshot.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)
      || !Object.hasOwn(files, 'aleph.config.json') || !Object.hasOwn(files, 'src/decider.mjs')) {
    fail('invalid_policy_snapshot');
  }
  for (const [path, content] of Object.entries(files)) {
    if (!allowedFiles.has(path) || typeof content !== 'string' || !content || content.includes('\0')) {
      fail('invalid_policy_snapshot');
    }
    if (secret.test(content)) fail('policy_contains_sensitive_values');
  }
  try {
    const config = JSON.parse(files['aleph.config.json']);
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail('invalid_policy_snapshot');
  } catch { fail('invalid_policy_snapshot'); }
  let root;
  try { root = resolve(trialDir); if (!(await stat(root)).isDirectory()) fail('invalid_trial_directory'); }
  catch { fail('invalid_trial_directory'); }
  const changes = [];
  for (const path of Object.keys(files).sort()) {
    let current = null;
    try {
      const actual = resolve(root, path);
      const inside = relative(root, actual);
      if (inside === '..' || inside.startsWith('../') || inside.startsWith('..\\') || isAbsolute(inside)) {
        fail('trial_policy_path_escape');
      }
      // Reject links/junctions at every child component. This does not rely on
      // Windows native realpath, and never follows a link out of the trial root.
      let component = root;
      for (const part of path.split('/')) {
        component = resolve(component, part);
        if ((await lstat(component)).isSymbolicLink()) fail('trial_policy_path_escape');
      }
      current = await readBounded(actual, 'trial_policy_file_missing');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        if (['trial_policy_path_escape', 'invalid_policy_file', 'policy_read_failed'].includes(error.message)) throw error;
        fail('trial_policy_read_failed');
      }
    }
    const target = Buffer.from(files[path], 'utf8');
    if (current && current.equals(target)) continue;
    const currentText = current?.toString('utf8') ?? '';
    if (secret.test(currentText)) fail('policy_contains_sensitive_values');
    changes.push({ path, operation: current ? 'replace' : 'add',
      currentSha256: current ? sha256(current) : null, safeSha256: sha256(target),
      changedLineRange: changedLines(currentText, files[path]) });
  }
  return { schema: 'aleph.policy.preview.v1', mode: 'preview_only',
    restoreVersion: snapshot.version, verifiedSnapshotSha256: sha256(bytes),
    scope: Object.keys(files).sort(), changes, applied: false };
}
