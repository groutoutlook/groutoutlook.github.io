import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeHtmlText } from './build-site.mjs';

const site = fileURLToPath(new URL('../site/', import.meta.url));
const checkoutExe = fileURLToPath(new URL('../../../../07.02-Rust/rarely/wordcloud/target/release/wordcloud.exe', import.meta.url));
const cloudFiles = ['topic-cloud.svg', 'topic-cloud-dark.svg'];

export function topicCloudInput(html) {
  const topics = html.match(/<details\b[^>]*\bid=["']topics["'][^>]*>([\s\S]*?)<\/details>/i)?.[1] ?? '';
  const tags = [...topics.matchAll(/<a\b[^>]*>\s*<span>([^<]+)<\/span>\s*<span class="til-tag-count">(\d+)<\/span>\s*<\/a>/g)]
    .map(([, label, count]) => ({ label: decodeHtmlText(label.trim()), count: Number(count) }))
    .filter(({ label, count }) => label && Number.isSafeInteger(count) && count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 36);
  if (tags.length === 0) return '';

  const style = '[style]\nwidth = 900\nheight = 320\nseed = 90\nvertical = 0.08\ncontrast = 0.65';
  const colours = '[colours]\nink = "#285c40"\naccent = "#176b3a"\n[colours-dark]\nink = "#a7c4ac"\naccent = "#78d694"';
  const tiers = tags.map(({ label, count }, index) =>
    `[[tier]]\nweight = ${count}\ncolour = "${index < 6 ? 'accent' : 'ink'}"\nwords = [${JSON.stringify(label)}]`);
  return [style, colours, ...tiers, ''].join('\n\n');
}

function refresh() {
  const input = topicCloudInput(fs.readFileSync(path.join(site, 'index.html'), 'utf8'));
  if (!input) {
    for (const file of cloudFiles) fs.rmSync(path.join(site, file), { force: true });
    return;
  }
  const command = process.env.WORDCLOUD_EXE || (process.platform === 'win32'
    ? (fs.existsSync(checkoutExe) ? checkoutExe : 'wordcloud.exe') : 'wordcloud');
  const cache = path.join(site, '..', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const temp = fs.mkdtempSync(path.join(cache, 'topic-cloud-'));
  try {
    const list = path.join(temp, 'topics.toml');
    fs.writeFileSync(list, input);
    const result = spawnSync(command, [list, '--backend', 'offline', '--out', path.join(temp, cloudFiles[0])], { encoding: 'utf8' });
    if (result.error) throw new Error(`Could not run ${command}. Set WORDCLOUD_EXE to the wordcloud executable.`, { cause: result.error });
    if (result.status !== 0) throw new Error(`wordcloud failed (${result.status ?? result.signal})\n${result.stderr}`);
    for (const file of cloudFiles) {
      if (!fs.statSync(path.join(temp, file)).size) throw new Error(`wordcloud produced an empty ${file}`);
    }
    for (const file of cloudFiles) fs.renameSync(path.join(temp, file), path.join(site, file));
    console.log('Generated the blog topic cloud in site/.');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) refresh();
