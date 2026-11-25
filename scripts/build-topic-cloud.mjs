import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeHtmlText } from './build-site.mjs';

const site = fileURLToPath(new URL('../site/', import.meta.url));
const checkoutExe = fileURLToPath(new URL('../../../../07.02-Rust/rarely/wordcloud/target/release/wordcloud.exe', import.meta.url));
const masterTagsPath = path.join(os.homedir(), 'hw/dot/config/jrnl/master-tags.toml');
const cloudStyle = `[style]
width = 900
height = 320
shape = "rect"
seed = 90
vertical = 0.05
contrast = 0.55

[colours]
ink = "#285c40"
accent = "#176b3a"

[colours-dark]
ink = "#a7c4ac"
accent = "#78d694"`;

function masterTags(dictionary) {
  // Match the table and string fields used by the shared jrnl dictionary.
  const journals = [];
  let journal;
  for (const line of dictionary.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      const table = line.match(/^\s*\[\s*master_tags\s*\.\s*(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))\s*\]\s*(?:#.*)?$/);
      const name = table?.[1] ?? table?.[2] ?? table?.[3];
      journal = name ? { name, parent: name, source: '', posts: 0, counts: new Map(), links: new Map() } : undefined;
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
    const tags = new Map();
    let parent;
    for (const [, classes, attributes, label] of metadata.matchAll(/<a class="(til-tag[^"]*)"([^>]*)>\s*(?:<span>)?([^<]+?)\s*(?:<\/span>)?\s*<\/a>/g)) {
      const name = decodeHtmlText(label.trim()).replace(/^#/, '').toLowerCase();
      if (classes.split(/\s+/).includes('parent-tag')) parent = name;
      else if (name) {
        const href = decodeHtmlText(attributes.match(/\bhref="([^"]+)"/)?.[1] ?? '');
        const route = href.match(/^\/(?:blog\/)?(category|subtag)\/(.+)$/);
        if (!tags.has(name)) tags.set(name, new Map());
        if (route) tags.get(name).set(route[1], route[2]);
      }
    }
    const journal = journals.get(parent);
    if (!journal) continue;
    journal.posts++;
    tags.delete(parent);
    tags.delete(journal.name.toLowerCase());
    for (const [name, routes] of tags) {
      journal.counts.set(name, (journal.counts.get(name) ?? 0) + 1);
      if (!journal.links.has(name)) journal.links.set(name, new Map());
      for (const [kind, route] of routes) {
        const existing = journal.links.get(name).get(kind);
        if (!existing || route < existing) journal.links.get(name).set(kind, route);
      }
    }
  }

  return [...journals.values()].filter(({ counts }) => counts.size)
    .map(({ name, parent, posts, counts, links }) => ({ name, parent, posts,
      tags: [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, 'en'))
        .map(([tag, count]) => [tag, count, Object.fromEntries([...links.get(tag)].sort())]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function* publishedPosts() {
  for (const entry of fs.readdirSync(path.join(site, 'post'), { withFileTypes: true })) {
    if (entry.isDirectory()) yield fs.readFileSync(path.join(site, 'post', entry.name, 'index.html'), 'utf8');
  }
}

export function wordcloudInput(tags) {
  const tiers = tags.slice(0, 36).map(([label, count], index) =>
    `[[tier]]\nweight = ${count}\ncolour = "${index < 6 ? 'accent' : 'ink'}"\nwords = [${JSON.stringify(label).replace(/\u007f/g, '\\u007F')}]`);
  return [cloudStyle, ...tiers, ''].join('\n\n');
}

function refresh() {
  const dictionary = fs.readFileSync(process.env.JRNL_MASTER_TAGS || masterTagsPath, 'utf8');
  const journals = journalWeaves(dictionary, publishedPosts());
  if (!journals.length) throw new Error('No published journals have tags for a word cloud.');
  const command = process.env.WORDCLOUD_EXE || (fs.existsSync(checkoutExe) ? checkoutExe : 'wordcloud');
  const cache = path.join(site, '..', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const temp = fs.mkdtempSync(path.join(cache, 'journal-weaves-'));
  const staged = path.join(temp, 'weaves');
  const destination = path.join(site, 'journal-weaves');
  try {
    const list = path.join(temp, 'words.toml');
    for (const journal of journals) {
      fs.writeFileSync(list, wordcloudInput(journal.tags));
      const directory = path.join(staged, journal.name);
      fs.mkdirSync(directory, { recursive: true });
      const output = path.join(directory, 'light.svg');
      const result = spawnSync(command, [list, '--backend', 'offline', '--out', output], { encoding: 'utf8' });
      if (result.error) throw new Error(`Could not run ${command}. Set WORDCLOUD_EXE to the Wordcloud executable.`, { cause: result.error });
      if (result.status !== 0) throw new Error(`Wordcloud failed for ${journal.name} (${result.status ?? result.signal})\n${result.stderr}`);
      const dark = path.join(directory, 'light-dark.svg');
      for (const file of [output, dark]) {
        if (!fs.readFileSync(file, 'utf8').includes('<path ')) throw new Error(`Wordcloud placed no words for ${journal.name}`);
      }
      fs.renameSync(dark, path.join(directory, 'dark.svg'));
    }
    fs.writeFileSync(path.join(staged, 'index.json'), `${JSON.stringify(journals)}\n`);
    fs.cpSync(staged, destination, { recursive: true });
    const current = new Set(journals.map(({ name }) => name));
    for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
      if (entry.isDirectory() && !current.has(entry.name)) fs.rmSync(path.join(destination, entry.name), { recursive: true });
    }
    for (const file of ['topic-cloud.svg', 'topic-cloud-dark.svg']) fs.rmSync(path.join(site, file), { force: true });
    console.log(`Generated ${journals.length} journal word clouds in site/journal-weaves/.`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) refresh();
