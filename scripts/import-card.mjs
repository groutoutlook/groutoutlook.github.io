import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node scripts/import-card.mjs <card project, dist directory, or extracted card-web release>');
const dist = fs.existsSync(path.join(source, 'dist/card.wasm')) ? path.join(source, 'dist') : source;
const required = ['app.html', 'index.html', 'wasm.html', 'wasm.js', 'card.wasm', 'animation.json', 'theme.css'];
for (const name of required) {
  if (!fs.statSync(path.join(dist, name), { throwIfNoEntry: false })?.isFile()) throw new Error(`Missing ${name} in ${dist}. Stage the browser release first (just wasm-stage).`);
}
const wasm = fs.readFileSync(path.join(dist, 'card.wasm'));
if (!WebAssembly.validate(wasm)) throw new Error('card.wasm is not a valid WebAssembly module.');
const wasmSha256 = createHash('sha256').update(wasm).digest('hex');
const provenance = fs.existsSync(path.join(dist, 'build.json')) ? JSON.parse(fs.readFileSync(path.join(dist, 'build.json'), 'utf8')) : {};
if (provenance.wasmSha256 && provenance.wasmSha256 !== wasmSha256) throw new Error('Release WASM checksum does not match build.json.');
const allowed = fs.readdirSync(dist).filter(name => /^[\w.-]+\.(?:html|js|css|wasm|json|svg|png|gif)$/.test(name));
// Check every declared local asset before replacing the last working snapshot.
for (const name of allowed.filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(dist, name), 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
    if (/^(?:[a-z]+:|\/)/i.test(url)) continue;
    if (!fs.existsSync(path.join(dist, url))) throw new Error(`${name} references missing asset ${url}. Complete the release exports first.`);
  }
}
const destination = path.join(root, 'assets/card');
if (dist === destination) throw new Error('Import source must be outside assets/card.');
fs.mkdirSync(path.dirname(destination), { recursive: true });
const staging = fs.mkdtempSync(path.join(root, '.card-import-'));
try {
  for (const name of allowed) fs.copyFileSync(path.join(dist, name), path.join(staging, name));
  const project = path.basename(dist) === 'dist' ? path.dirname(dist) : null;
  let commit = provenance.commit || null, dirty = provenance.dirty ?? null;
  if (project && fs.existsSync(path.join(project, '.git'))) {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
    dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }).trim());
  }
  fs.writeFileSync(path.join(staging, 'build.json'), JSON.stringify({
    repository: 'https://github.com/groutoutlook/card', commit, dirty,
    importedAt: new Date().toISOString(), wasmSha256,
  }, null, 2) + '\n');
  const license = path.join(project || dist, 'LICENSE');
  if (fs.existsSync(license)) fs.copyFileSync(license, path.join(staging, 'LICENSE'));
  fs.mkdirSync(destination, { recursive: true });
  // Replace only files managed by this importer; never delete the source project.
  for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`Unexpected directory in card snapshot: ${entry.name}`);
    fs.unlinkSync(path.join(destination, entry.name));
  }
  for (const name of fs.readdirSync(staging)) fs.copyFileSync(path.join(staging, name), path.join(destination, name));
  console.log(`Imported ${allowed.length} card assets into assets/card${dirty ? ' (local changes included)' : ''}.`);
} finally {
  for (const name of fs.readdirSync(staging)) fs.unlinkSync(path.join(staging, name));
  fs.rmdirSync(staging);
}
