import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetPattern = /^[\w.-]+\.(?:html|js|css|wasm|json|svg|png|gif)$/;

export function assetFingerprint(directory) {
  const hash = createHash('sha256');
  const names = fs.readdirSync(directory).filter(name => name !== 'build.json' && (assetPattern.test(name) || name === 'LICENSE')).sort();
  for (const name of names) hash.update(name).update('\0').update(fs.readFileSync(path.join(directory, name))).update('\0');
  return hash.digest('hex');
}

export function importCard(source, { destination = path.join(root, 'assets/card'), repository } = {}) {
  source = path.resolve(source);
  const dist = fs.existsSync(path.join(source, 'dist/card.wasm')) ? path.join(source, 'dist') : source;
  if (dist === path.resolve(destination)) throw new Error('Import source must be outside assets/card.');
  for (const name of ['app.html', 'index.html', 'wasm.html', 'wasm.js', 'card.wasm', 'animation.json', 'theme.css']) {
    if (!fs.statSync(path.join(dist, name), { throwIfNoEntry: false })?.isFile()) throw new Error(`Missing ${name} in ${dist}. Build the browser files first.`);
  }
  const wasm = fs.readFileSync(path.join(dist, 'card.wasm'));
  if (!WebAssembly.validate(wasm)) throw new Error('card.wasm is not a valid WebAssembly module.');
  const wasmSha256 = createHash('sha256').update(wasm).digest('hex');
  const provenance = fs.existsSync(path.join(dist, 'build.json')) ? JSON.parse(fs.readFileSync(path.join(dist, 'build.json'), 'utf8')) : {};
  if (provenance.wasmSha256 && provenance.wasmSha256 !== wasmSha256) throw new Error('WASM checksum does not match build.json.');
  const allowed = fs.readdirSync(dist).filter(name => name !== 'build.json' && assetPattern.test(name));
  for (const name of allowed.filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dist, name), 'utf8');
    for (const [, url] of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
      if (/^(?:[a-z]+:|\/)/i.test(url)) continue;
      if (!fs.existsSync(path.join(dist, url))) throw new Error(`${name} references missing asset ${url}.`);
    }
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.card-import-'));
  try {
    for (const name of allowed) fs.copyFileSync(path.join(dist, name), path.join(staging, name));
    const project = path.basename(dist) === 'dist' ? path.dirname(dist) : null;
    let commit = provenance.commit || null, dirty = provenance.dirty ?? null;
    if (project && fs.existsSync(path.join(project, '.git'))) {
      const git = args => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
      commit = git(['rev-parse', 'HEAD']);
      dirty = Boolean(git(['status', '--porcelain']));
      repository ||= git(['config', '--get', 'remote.origin.url']);
    }
    const license = path.join(project || dist, 'LICENSE');
    if (fs.existsSync(license)) fs.copyFileSync(license, path.join(staging, 'LICENSE'));
    const contentSha256 = assetFingerprint(staging);
    const manifest = { repository: (repository || provenance.repository || 'https://github.com/groutoutlook/card').replace(/\.git$/, ''), commit, dirty, wasmSha256, contentSha256 };
    const previousPath = path.join(destination, 'build.json');
    if (fs.existsSync(previousPath)) {
      const previous = JSON.parse(fs.readFileSync(previousPath, 'utf8'));
      if (Object.entries(manifest).every(([key, value]) => previous[key] === value) && assetFingerprint(destination) === contentSha256) {
        console.log(`Card already up to date (${commit?.slice(0, 8) || 'same browser files'}).`);
        return { changed: false, commit };
      }
    }
    fs.writeFileSync(path.join(staging, 'build.json'), JSON.stringify({ ...manifest, importedAt: new Date().toISOString() }, null, 2) + '\n');
    fs.mkdirSync(destination, { recursive: true });
    const entries = fs.readdirSync(destination, { withFileTypes: true });
    if (entries.some(entry => !entry.isFile())) throw new Error('Unexpected directory in card snapshot.');
    for (const entry of entries) fs.unlinkSync(path.join(destination, entry.name));
    for (const name of fs.readdirSync(staging)) fs.copyFileSync(path.join(staging, name), path.join(destination, name));
    console.log(`Imported ${allowed.length} card assets${commit ? ` from ${commit.slice(0, 8)}` : ''}${dirty ? ' (local changes included)' : ''}.`);
    return { changed: true, commit };
  } finally {
    for (const name of fs.readdirSync(staging)) fs.unlinkSync(path.join(staging, name));
    fs.rmdirSync(staging);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('Use just card-import to fetch the latest commit, or pass a browser-build directory.');
    importCard(process.argv[2]);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
