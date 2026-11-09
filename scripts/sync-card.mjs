import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assetFingerprint, importCard } from './import-card.mjs';
import { assemble } from './build-site.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', windowsHide: true })?.trim();
}

export async function buildBrowserCard(directory) {
  console.log('Building the latest committed card for the browser…');
  run('rustup', ['target', 'add', '--toolchain', 'stable', 'wasm32-unknown-unknown'], directory);
  if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', 'npm ci --no-audit --no-fund'], directory);
  else run('npm', ['ci', '--no-audit', '--no-fund'], directory);
  run('cargo', ['+stable', 'build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '--lib', '--no-default-features'], directory);
  run(process.execPath, ['scripts/package-wasm.js'], directory);
  const { exportCard } = require(path.join(directory, 'scripts/export.js'));
  for (const layout of ['', 'portrait']) {
    if (layout && !fs.existsSync(path.join(directory, 'dist/card.portrait.svg'))) continue;
    for (const format of ['png', 'gif']) {
      const filename = `card${layout ? '.portrait' : ''}.${format}`;
      await exportCard(format, path.join(directory, 'dist', filename), { previewLayout: layout || undefined });
      console.log(`Exported ${filename}.`);
    }
  }
}

export async function syncCard({ projectRoot = root, repository, ref, build = buildBrowserCard } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'card.config.json'), 'utf8'));
  repository ||= config.repository;
  ref ||= config.ref || 'HEAD';
  const cacheRoot = path.join(projectRoot, '.cache');
  const checkout = path.join(cacheRoot, 'card');
  fs.mkdirSync(cacheRoot, { recursive: true });
  const lockPath = path.join(cacheRoot, 'card-sync.lock');
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('A card update is starting; retry in a moment.');
    let running = false;
    try { if (pid > 0) { process.kill(pid, 0); running = true; } } catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (running) throw new Error('Another card update is already running.');
    fs.unlinkSync(lockPath);
  }
  const lock = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(lock, String(process.pid));
  try {
    if (!fs.existsSync(checkout)) {
      console.log('Fetching the private card source into the ignored build cache…');
      run('git', ['clone', '--depth=1', repository, checkout], projectRoot);
    }
    if (!fs.existsSync(path.join(checkout, '.git'))) throw new Error('The card build cache is not a Git checkout.');
    if (run('git', ['status', '--porcelain'], checkout, true)) throw new Error('The cached card checkout has local edits; leaving them untouched.');
    const origin = run('git', ['remote', 'get-url', 'origin'], checkout, true);
    if (origin !== repository) throw new Error('Card repository changed. Move .cache/card aside before syncing the new repository.');
    run('git', ['fetch', '--depth=1', 'origin', ref], checkout);
    const commit = run('git', ['rev-parse', 'FETCH_HEAD'], checkout, true);
    const destination = path.join(projectRoot, 'assets/card');
    const manifestPath = path.join(destination, 'build.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
    if (manifest.commit === commit && manifest.dirty === false && manifest.repository === repository.replace(/\.git$/, '') && manifest.contentSha256 && assetFingerprint(destination) === manifest.contentSha256) {
      console.log(`Card already at the latest commit (${commit.slice(0, 8)}); no build needed.`);
      return { changed: false, commit };
    }
    run('git', ['checkout', '--detach', commit], checkout);
    await build(checkout);
    return importCard(checkout, { destination, repository });
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

export function publishCard(projectRoot = root) {
  const changes = run('git', ['status', '--porcelain', '--', 'assets/card'], projectRoot, true);
  const pending = run('git', ['log', '--format=%H', '@{upstream}..HEAD', '--', 'assets/card'], projectRoot, true);
  if (!changes && !pending) { console.log('No card changes to publish.'); return; }
  if (changes) assemble({ blogSource: path.join(projectRoot, 'site'), cardSource: path.join(projectRoot, 'assets/card'), output: path.join(projectRoot, 'public') });
  run('pwsh', ['-NoProfile', '-File', path.join(projectRoot, 'scripts/Publish-TilSite.ps1'), '-CardOnly'], projectRoot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2).filter(Boolean);
    if (args.length > 1) throw new Error('Usage: just card-import [browser-build directory], or just card-publish');
    if (args[0] && args[0] !== '--publish') importCard(args[0]);
    else await syncCard();
    if (args[0] === '--publish') publishCard();
  } catch (error) {
    console.error(`Card update failed: ${error.stderr?.toString().trim() || error.message}`);
    process.exitCode = 1;
  }
}
