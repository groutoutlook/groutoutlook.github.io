import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeHtmlText } from './build-site.mjs';

const site = fileURLToPath(new URL('../site/', import.meta.url));
const checkout = new URL('../../../../07.02-Rust/rarely/glyphweave/', import.meta.url);
const checkoutExe = fileURLToPath(new URL('target/release/glyphweave.exe', checkout));
const checkoutFont = fileURLToPath(new URL('fonts/Roboto-Regular.ttf', checkout));
const masterTagsPath = path.join(os.homedir(), 'hw/dot/config/jrnl/master-tags.toml');
const palettes = {
  'light.svg': '#184f37,#206549,#28634c,#396935,#365c41',
  'dark.svg': '#a1dcb7,#77c99b,#8dd1ae,#c2de9b,#b1cdb8',
};

function masterTags(dictionary) {
  // Match the table and string fields used by the shared jrnl dictionary.
  const journals = [];
  let journal;
  for (const line of dictionary.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      const table = line.match(/^\s*\[\s*master_tags\s*\.\s*(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))\s*\]\s*(?:#.*)?$/);
      const name = table?.[1] ?? table?.[2] ?? table?.[3];
      journal = name ? { name, parent: name, source: '', posts: 0, counts: new Map() } : undefined;
      if (journal) journals.push(journal);
    } else if (journal) {
      const field = line.match(/^\s*(source|parent_tag)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*(?:#.*)?$/);
      if (field) journal[field[1] === 'source' ? 'source' : 'parent'] = field[2] ?? field[3];
    }
  }
  if (!journals.length) throw new Error('No master tag tables found in the jrnl dictionary.');
  return journals.filter(journal => journal.source);
}

export function journalWeaves(dictionary, posts) {
  const journals = new Map();
  for (const journal of masterTags(dictionary)) {
    const parent = journal.parent.toLowerCase();
    if (journals.has(parent)) throw new Error(`Multiple journals use parent tag ${parent}.`);
    journals.set(parent, journal);
  }

  for (const html of posts) {
    // Read Tiller's published metadata, bounded before the entry body.
    const metadata = html.split(/<div\s+class="til-content"/i, 1)[0];
    const tags = new Set();
    let parent;
    for (const [, classes, label] of metadata.matchAll(/<a class="(til-tag[^"]*)"[^>]*>\s*(?:<span>)?([^<]+?)\s*(?:<\/span>)?\s*<\/a>/g)) {
      const name = decodeHtmlText(label.trim()).replace(/^#/, '').toLowerCase();
      if (classes.split(/\s+/).includes('parent-tag')) parent = name;
      else if (name) tags.add(name);
    }
    const journal = journals.get(parent);
    if (!journal) continue;
    journal.posts++;
    tags.delete(parent);
    tags.delete(journal.name.toLowerCase());
    for (const name of tags) journal.counts.set(name, (journal.counts.get(name) ?? 0) + 1);
  }

  return [...journals.values()].filter(({ counts }) => counts.size)
    .map(({ name, parent, posts, counts }) => ({ name, parent, posts,
      tags: [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, 'en')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function* publishedPosts() {
  for (const entry of fs.readdirSync(path.join(site, 'post'), { withFileTypes: true })) {
    if (entry.isDirectory()) yield fs.readFileSync(path.join(site, 'post', entry.name, 'index.html'), 'utf8');
  }
}

function refresh() {
  const dictionary = fs.readFileSync(process.env.JRNL_MASTER_TAGS || masterTagsPath, 'utf8');
  const journals = journalWeaves(dictionary, publishedPosts());
  if (!journals.length) throw new Error('No published journals have tags to weave.');
  const command = process.env.GLYPHWEAVE_EXE || (fs.existsSync(checkoutExe) ? checkoutExe : 'glyphweave');
  const font = process.env.GLYPHWEAVE_FONT || (fs.existsSync(checkoutFont) ? checkoutFont : undefined);
  const cache = path.join(site, '..', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const temp = fs.mkdtempSync(path.join(cache, 'journal-weaves-'));
  const staged = path.join(temp, 'weaves');
  const destination = path.join(site, 'journal-weaves');
  try {
    const list = path.join(temp, 'words.txt');
    for (const journal of journals) {
      const words = journal.tags.filter(([label]) => !/^[#]|[,\r\n]/.test(label)).slice(0, 120);
      if (!words.length) throw new Error(`No tags can be woven for ${journal.name}.`);
      // Glyphweave samples with replacement. Compress weights to improve variety.
      fs.writeFileSync(list, words.map(([label, count]) => `${label},${Math.sqrt(count)}`).join('\n'));
      const directory = path.join(staged, journal.name);
      fs.mkdirSync(directory, { recursive: true });
      const mask = journal.name.toUpperCase();
      const multiline = mask.length > 12 && mask.includes('-');
      for (const [file, colors] of Object.entries(palettes)) {
        const output = path.join(directory, file);
        const args = [multiline ? '--text-lines' : '--text', multiline ? mask.replaceAll('-', ',') : mask,
          '--canvas-size', '900,320', '--seed', '90', '--algorithm', 'fast-grid', '--word-size-range', words.length < 5 ? '4,18' : '7,22',
          '--word-padding', '1', '--rotations', '0,90', '--max-tries', '6000', '--word-file', list,
          '--colors', colors, '--no-progress', '--output', output];
        if (font) args.push('--font', font);
        const result = spawnSync(command, args, { encoding: 'utf8' });
        if (result.error) throw new Error(`Could not run ${command}. Set GLYPHWEAVE_EXE to the Glyphweave executable.`, { cause: result.error });
        if (result.status !== 0) throw new Error(`Glyphweave failed for ${journal.name} (${result.status ?? result.signal})\n${result.stderr}`);
        if (!fs.readFileSync(output, 'utf8').includes('<text ')) throw new Error(`Glyphweave placed no words for ${journal.name}`);
      }
    }
    fs.writeFileSync(path.join(staged, 'index.json'), `${JSON.stringify(journals)}\n`);
    fs.cpSync(staged, destination, { recursive: true });
    const current = new Set(journals.map(({ name }) => name));
    for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
      if (entry.isDirectory() && !current.has(entry.name)) fs.rmSync(path.join(destination, entry.name), { recursive: true });
    }
    for (const file of ['topic-cloud.svg', 'topic-cloud-dark.svg']) fs.rmSync(path.join(site, file), { force: true });
    console.log(`Generated ${journals.length} Glyphweave journal clouds in site/journal-weaves/.`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) refresh();
