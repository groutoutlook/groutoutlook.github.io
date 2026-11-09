import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assetFingerprint, importCard } from '../scripts/import-card.mjs';
import { publishCard, syncCard } from '../scripts/sync-card.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function init(directory) {
  fs.mkdirSync(directory, { recursive: true });
  git(directory, 'init', '--initial-branch=main');
  git(directory, 'config', 'user.name', 'Site test');
  git(directory, 'config', 'user.email', 'test@example.invalid');
  git(directory, 'config', 'commit.gpgsign', 'false');
  git(directory, 'config', 'core.hooksPath', path.join(directory, 'no-hooks'));
}
function commit(directory, message) { git(directory, 'add', '-A'); git(directory, 'commit', '-m', message); }
function browserFiles(directory, version = 'one') {
  fs.mkdirSync(directory, { recursive: true });
  const html = `<html><head><title>Card</title></head><body><header></header>${version}<nav class="app-actions"></nav><div class="actions"></div></body></html>`;
  for (const name of ['app.html', 'index.html', 'wasm.html']) fs.writeFileSync(path.join(directory, name), html);
  fs.writeFileSync(path.join(directory, 'wasm.js'), '// browser host');
  fs.writeFileSync(path.join(directory, 'animation.json'), '{}');
  fs.writeFileSync(path.join(directory, 'theme.css'), 'body{}');
  fs.writeFileSync(path.join(directory, 'card.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
}
function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-sync-test-'));
  const projectRoot = path.join(temp, 'website'), source = path.join(temp, 'private-card');
  fs.mkdirSync(projectRoot);
  init(source);
  fs.writeFileSync(path.join(source, '.gitignore'), '/dist/\n');
  fs.writeFileSync(path.join(source, 'version.txt'), 'one');
  fs.writeFileSync(path.join(source, 'LICENSE'), 'Fixture license');
  commit(source, 'Initial card');
  const repository = source.split(path.sep).join('/');
  fs.writeFileSync(path.join(projectRoot, 'card.config.json'), JSON.stringify({ repository, ref: 'HEAD' }));
  const build = async directory => browserFiles(path.join(directory, 'dist'), fs.readFileSync(path.join(directory, 'version.txt'), 'utf8'));
  const cleanup = () => {
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('card-sync-test-'));
    fs.rmSync(temp, { recursive: true, force: true });
  };
  return { temp, projectRoot, source, build, cleanup };
}

test('latest-commit sync builds once, preserves local source edits, and picks up the next commit', async () => {
  const f = fixture();
  let builds = 0;
  const build = async directory => { builds++; await f.build(directory); };
  try {
    fs.writeFileSync(path.join(f.source, 'version.txt'), 'uncommitted work');
    const first = await syncCard({ projectRoot: f.projectRoot, build });
    assert.equal(first.changed, true);
    const assets = path.join(f.projectRoot, 'assets/card');
    assert.ok(fs.readFileSync(path.join(assets, 'app.html'), 'utf8').includes('one'));
    assert.equal(fs.readFileSync(path.join(f.source, 'version.txt'), 'utf8'), 'uncommitted work');
    const manifest = fs.readFileSync(path.join(assets, 'build.json'), 'utf8');
    const second = await syncCard({ projectRoot: f.projectRoot, build });
    assert.equal(second.changed, false);
    assert.equal(builds, 1);
    assert.equal(fs.readFileSync(path.join(assets, 'build.json'), 'utf8'), manifest);
    fs.writeFileSync(path.join(f.source, 'version.txt'), 'two');
    commit(f.source, 'Update the card');
    const third = await syncCard({ projectRoot: f.projectRoot, build });
    assert.equal(third.changed, true);
    assert.equal(builds, 2);
    assert.equal(third.commit, git(f.source, 'rev-parse', 'HEAD'));
    assert.ok(fs.readFileSync(path.join(assets, 'app.html'), 'utf8').includes('two'));
    const imported = JSON.parse(fs.readFileSync(path.join(assets, 'build.json'), 'utf8'));
    assert.equal(imported.dirty, false);
    assert.equal(imported.contentSha256, assetFingerprint(assets));
  } finally { f.cleanup(); }
});

test('a failed build and a dirty cached checkout keep the last working card intact', async () => {
  const f = fixture();
  try {
    await syncCard({ projectRoot: f.projectRoot, build: f.build });
    const assets = path.join(f.projectRoot, 'assets/card');
    const previous = fs.readFileSync(path.join(assets, 'build.json'), 'utf8');
    fs.writeFileSync(path.join(f.source, 'version.txt'), 'two');
    commit(f.source, 'New source');
    await assert.rejects(syncCard({ projectRoot: f.projectRoot, build: async () => { throw new Error('Compiler failed'); } }), /Compiler failed/);
    assert.equal(fs.readFileSync(path.join(assets, 'build.json'), 'utf8'), previous);
    assert.ok(!fs.existsSync(path.join(f.projectRoot, '.cache/card-sync.lock')));
    const edited = path.join(f.projectRoot, '.cache/card/version.txt');
    fs.writeFileSync(edited, 'keep this edit');
    await assert.rejects(syncCard({ projectRoot: f.projectRoot, build: f.build }), /local edits/);
    assert.equal(fs.readFileSync(edited, 'utf8'), 'keep this edit');
    assert.equal(fs.readFileSync(path.join(assets, 'build.json'), 'utf8'), previous);
  } finally { f.cleanup(); }
});

test('manual imports are idempotent and invalid browser files do not replace the working snapshot', () => {
  const f = fixture();
  try {
    const source = path.join(f.temp, 'browser-files'), destination = path.join(f.projectRoot, 'assets/card');
    browserFiles(source);
    assert.equal(importCard(source, { destination }).changed, true);
    const manifest = fs.readFileSync(path.join(destination, 'build.json'), 'utf8');
    assert.equal(importCard(source, { destination }).changed, false);
    assert.equal(fs.readFileSync(path.join(destination, 'build.json'), 'utf8'), manifest);
    fs.appendFileSync(path.join(source, 'app.html'), '<script src="missing.js"></script>');
    assert.throws(() => importCard(source, { destination }), /missing asset/);
    assert.equal(fs.readFileSync(path.join(destination, 'build.json'), 'utf8'), manifest);
  } finally { f.cleanup(); }
});

test('card publishing commits only card assets and retries an already committed update', { skip: spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status !== 0 }, () => {
  const f = fixture();
  try {
    const directory = f.projectRoot, remote = path.join(f.temp, 'site-origin.git');
    init(directory);
    fs.mkdirSync(remote);
    git(remote, 'init', '--bare', '--initial-branch=main');
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.copyFileSync(path.join(root, 'scripts/Publish-TilSite.ps1'), path.join(directory, 'scripts/Publish-TilSite.ps1'));
    browserFiles(path.join(directory, 'assets/card'));
    fs.mkdirSync(path.join(directory, 'site'));
    fs.writeFileSync(path.join(directory, 'site/index.html'), '<html><head></head><body>Blog</body></html>');
    commit(directory, 'Initial website');
    git(directory, 'remote', 'add', 'origin', remote);
    git(directory, 'push', '--set-upstream', 'origin', 'main');
    fs.writeFileSync(path.join(directory, 'assets/card/app.html'), '<html><head></head><body><nav class="app-actions"></nav>Updated card</body></html>');
    fs.appendFileSync(path.join(directory, 'site/index.html'), 'Unpublished blog change');
    fs.writeFileSync(path.join(directory, 'notes.txt'), 'Unrelated staged work');
    git(directory, 'add', 'notes.txt');
    publishCard(directory);
    assert.equal(git(directory, 'show', '--format=', '--name-only', 'HEAD'), 'assets/card/app.html');
    assert.equal(git(directory, 'rev-parse', 'HEAD'), git(remote, 'rev-parse', 'refs/heads/main'));
    assert.ok(git(directory, 'status', '--porcelain').includes('site/index.html'));
    assert.equal(git(directory, 'diff', '--cached', '--name-only'), 'notes.txt');
    fs.appendFileSync(path.join(directory, 'assets/card/theme.css'), '/* updated */');
    git(directory, 'add', 'assets/card/theme.css');
    git(directory, 'commit', '-m', 'Pending card update', '--', 'assets/card/theme.css');
    publishCard(directory);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), git(remote, 'rev-parse', 'refs/heads/main'));
    const head = git(directory, 'rev-parse', 'HEAD');
    publishCard(directory);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), head);
  } finally { f.cleanup(); }
});
