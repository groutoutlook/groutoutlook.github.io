import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const tag = process.argv[2] || 'latest';
const repository = process.argv[3] || 'groutoutlook/card';
if (process.argv.length > 4 || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Usage: node scripts/import-card-release.mjs [tag|latest] [owner/repo]');
const staging = fs.mkdtempSync(path.join(root, '.card-import-'));
try {
  const selected = JSON.parse(execFileSync('gh', ['release', 'view', ...(tag === 'latest' ? [] : [tag]), '--repo', repository, '--json', 'tagName,url'], { encoding: 'utf8' }));
  execFileSync('gh', ['release', 'download', selected.tagName, '--repo', repository, '--pattern', 'card-web.zip', '--dir', staging], { stdio: 'inherit' });
  const archive = path.join(staging, 'card-web.zip'), extracted = path.join(staging, 'extracted');
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)}`], { stdio: 'inherit', windowsHide: true });
  execFileSync(process.execPath, [path.join(root, 'scripts/import-card.mjs'), extracted], { stdio: 'inherit' });
  const manifest = path.join(root, 'assets/card/build.json');
  fs.writeFileSync(manifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, 'utf8')), repository: `https://github.com/${repository}`, releaseTag: selected.tagName, releaseUrl: selected.url }, null, 2) + '\n');
  console.log(`Imported browser artifacts from ${repository} release ${selected.tagName}. Run just assemble.`);
} finally {
  if (path.dirname(staging) !== path.resolve(root) || !path.basename(staging).startsWith('.card-import-')) throw new Error('Unsafe temporary directory.');
  fs.rmSync(staging, { recursive: true });
}
