import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetPattern = /^[\w.-]+\.(?:html|js|css|wasm|json|svg|png|gif)$/;
const fontPattern = /^[\w.-]+\.(?:woff2?|ttf|otf|txt|md)$/;

function assetFiles(directory) {
  const files = [];
  function fonts(relative) {
    for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) fonts(next);
      else if (entry.isFile() && fontPattern.test(entry.name)) files.push(next);
      else throw new Error(`Unexpected font asset: ${next}`);
    }
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'fonts') {
      if (!entry.isDirectory()) throw new Error('The fonts asset must be a real directory.');
      fonts('fonts');
    } else if (entry.name !== 'build.json' && (assetPattern.test(entry.name) || entry.name === 'LICENSE')) {
      if (!entry.isFile()) throw new Error(`Unexpected card asset: ${entry.name}`);
      files.push(entry.name);
    }
  }
  return files.sort();
}

function validateReferences(directory, files) {
  for (const name of files.filter(name => /\.(?:html|css)$/.test(name))) {
    const content = fs.readFileSync(path.join(directory, name), 'utf8');
    const urls = [...content.matchAll(/(?:src|href)="([^"#?]+)"/g), ...content.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)];
    for (const [, url] of urls) {
      if (/^(?:[a-z]+:|\/|#)/i.test(url)) continue;
      const target = path.resolve(path.dirname(path.join(directory, name)), url.split(/[?#]/)[0]);
      const relative = path.relative(directory, target);
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.statSync(target, { throwIfNoEntry: false })?.isFile()) throw new Error(`${name} references missing asset ${url}.`);
    }
  }
}

export function assetFingerprint(directory) {
  const hash = createHash('sha256');
  const names = assetFiles(directory);
  for (const name of names) hash.update(name).update('\0').update(fs.readFileSync(path.join(directory, name))).update('\0');
  return hash.digest('hex');
}

export function importCard(source, { destination = path.join(root, 'assets/card'), repository } = {}) {
  source = path.resolve(source);
  destination = path.resolve(destination);
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
  const allowed = assetFiles(dist);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.card-import-'));
  try {
    for (const name of allowed) {
      fs.mkdirSync(path.dirname(path.join(staging, name)), { recursive: true });
      fs.copyFileSync(path.join(dist, name), path.join(staging, name));
    }
    validateReferences(staging, allowed);
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
    if (entries.some(entry => !entry.isFile() && !(entry.name === 'fonts' && entry.isDirectory()))) throw new Error('Unexpected directory in card snapshot.');
    assetFiles(destination); // Reject symlinks before removing the previous font tree.
    for (const entry of entries) {
      const target = path.resolve(destination, entry.name);
      if (path.dirname(target) !== destination) throw new Error('Unsafe card asset path.');
      if (entry.isDirectory()) fs.rmSync(target, { recursive: true });
      else fs.unlinkSync(target);
    }
    fs.cpSync(staging, destination, { recursive: true });
    console.log(`Imported ${allowed.length} card assets${commit ? ` from ${commit.slice(0, 8)}` : ''}${dirty ? ' (local changes included)' : ''}.`);
    return { changed: true, commit };
  } finally {
    if (path.dirname(staging) !== path.dirname(destination) || !path.basename(staging).startsWith('.card-import-')) throw new Error('Unsafe card staging directory.');
    fs.rmSync(staging, { recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('Use just card-import to fetch the latest commit, or pass a browser-build directory.');
    importCard(process.argv[2]);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
