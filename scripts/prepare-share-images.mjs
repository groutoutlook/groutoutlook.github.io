import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pageMetadata, readPublicProfile } from './build-site.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cardRoot = path.resolve(process.env.CARD_PROJECT || path.join(root, '../../../07.02-Rust/proj/card'));
const { renderShareImage } = (await import(pathToFileURL(path.join(cardRoot, 'scripts/share-image.js')).href)).default;
const directory = path.join(root, 'assets/site/og');
fs.mkdirSync(directory, { recursive: true });
const indexPath = path.join(directory, 'index.json');
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {};
const source = path.join(cardRoot, 'dist/card.wasm');
const profile = readPublicProfile(path.join(cardRoot, 'dist/card.profile.json'));
if (!profile.profile) throw new Error('Stage the card first to generate card.profile.json from profile.toml.');
const site = profile.sharing.blog_title;
const cover = await renderShareImage({ title: site, site, description: profile.text.quote, output: path.join(directory, 'blog.png'), source });
index['*'] = path.basename(cover);
for (const value of process.argv.slice(2)) {
  const relative = value.replace(/^\/?blog\//, '').replace(/^\//, '').replace(/\/$/, '') + '/index.html';
  const filename = path.resolve(root, 'site', relative);
  if (!filename.startsWith(path.resolve(root, 'site') + path.sep)) throw new Error('Page must be inside site/.');
  const { title, description } = pageMetadata(fs.readFileSync(filename, 'utf8'), profile);
  const image = createHash('sha256').update(relative).digest('hex').slice(0, 16) + '.png';
  await renderShareImage({ title, description, site, output: path.join(directory, image), source });
  index[relative] = image;
  console.log(`Prepared ${relative} → og/${image}`);
}
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log('Prepared the shared blog cover. Assembly uses these local PNGs without network requests.');
