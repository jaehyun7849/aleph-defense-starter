import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('bundle records root, ordinary and merge changes, but rejects a genuinely empty commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'aleph-bundle-merge-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  const put = (path, value) => writeFileSync(join(root, path), value);
  const commit = message => { git('add', '.'); git('commit', '-m', message); };
  const run = () => spawnSync(process.execPath, ['scripts/bundle.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const result = () => JSON.parse(readFileSync(join(root, 'artifacts/submission.json'), 'utf8'));
  try {
    git('init');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture');
    git('config', 'commit.gpgsign', 'false');
    git('remote', 'add', 'origin', 'https://github.com/example/fixture.git');
    for (const dir of ['scripts', 'src']) mkdirSync(join(root, dir));
    copyFileSync(new URL('../scripts/bundle.mjs', import.meta.url), join(root, 'scripts/bundle.mjs'));
    put('package.json', '{"type":"module"}');
    put('.gitignore', 'artifacts/\nbundle-notes.json\n');
    put('aleph.config.json', JSON.stringify({ step: 1, repoUrl: 'https://github.com/example/fixture' }));
    put('src/decider.mjs', 'export const RULE_IDS = ["fixture_rule"];');
    // Isolated serialization fixture; no operational HTTP result is claimed.
    put('src/attack-check.mjs', 'export async function runAttackChecks(){return [{attackId:"fixture",expected:"fixture only",observed:"not a live check"}]}');
    put('bundle-notes.json', JSON.stringify({ explanation: 'Isolated bundle serialization fixture only.' }));
    commit('root');
    assert.equal(run().status, 0);
    assert.ok(result().changedFiles.includes('scripts/bundle.mjs'));
    put('README.md', 'base\n');
    commit('ordinary');
    assert.equal(run().status, 0);
    assert.deepEqual(result().changedFiles, ['README.md']);
    const primary = git('branch', '--show-current');
    git('checkout', '-b', 'feature');
    put('README.md', 'feature documentation\n');
    commit('feature');
    git('checkout', primary);
    put('unrelated.txt', 'preserve\n');
    commit('primary');
    git('merge', '--no-ff', 'feature', '-m', 'merge');
    const merged = run();
    assert.equal(merged.status, 0, merged.stderr);
    assert.equal(result().commit, git('rev-parse', 'HEAD'));
    assert.deepEqual(result().changedFiles, ['README.md']);
    git('commit', '--allow-empty', '-m', 'empty');
    const empty = run();
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /마지막 커밋에 바뀐 파일이 없습니다/);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), 'aleph-bundle-merge-')));
    rmSync(root, { recursive: true, force: true });
  }
});
