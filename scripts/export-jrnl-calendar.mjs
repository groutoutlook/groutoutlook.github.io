import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const newline = '\r\n';

function escapeText(text) {
  return text.replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;').replaceAll(',', '\\,');
}

function foldLine(line) {
  let result = '';
  let bytes = 0;
  for (const char of line) {
    const width = Buffer.byteLength(char);
    if (bytes + width > 75) {
      result += newline + ' ';
      bytes = 1;
    }
    result += char;
    bytes += width;
  }
  return result;
}

function calendar(records) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tiller Blog//jrnl Export//EN',
    ...records.flatMap(record => record.lines), 'END:VCALENDAR', ''].map(foldLine).join(newline);
}

function recordsFor(entries, alias, kind) {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const occurrences = new Map();
  return entries.map(({ entry, source }) => {
    const { uuid, date, time, title, body, tags } = entry;
    const day = new Date(date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf())
      || day.toISOString().slice(0, 10) !== date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new Error('jrnl returned an invalid entry date or time.');
    }

    const instant = date + 'T' + time;
    const occurrence = (occurrences.get(instant) ?? 0) + 1;
    occurrences.set(instant, occurrence);
    const identity = uuid || instant + '#' + occurrence;
    const id = createHash('sha256').update(JSON.stringify([alias, source, identity])).digest('hex').slice(0, 32);
    const uid = id + '@jrnl.local';
    const component = kind === 'event' ? 'VEVENT' : 'VJOURNAL';
    const dayValue = date.replaceAll('-', '');
    const start = kind === 'event' ? 'DTSTART;VALUE=DATE:' + dayValue : 'DTSTART:' + dayValue + 'T' + time.replace(':', '') + '00';
    const lines = ['BEGIN:' + component, 'UID:' + uid, 'DTSTAMP:' + stamp, start, 'SUMMARY:' + escapeText(title)];
    if (body) lines.push('DESCRIPTION:' + escapeText(body));
    if (tags?.length) lines.push('CATEGORIES:' + tags.map(escapeText).join(','));
    if (kind === 'event') lines.push('TRANSP:TRANSPARENT');
    lines.push('END:' + component);
    return { id, lines };
  });
}

function runJrnl(alias, values) {
  const args = [alias, '--format', 'json'];
  for (const [option, flag] of [['from', '-from'], ['to', '-to'], ['config-file', '--config-file']]) {
    if (values[option] !== undefined) args.push(flag, values[option]);
  }
  const result = spawnSync('jrnl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['inherit', 'pipe', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('jrnl export failed (' + (result.status ?? result.signal) + ').');
  const { entries } = JSON.parse(result.stdout);
  if (!Array.isArray(entries)) throw new Error('jrnl returned no entries array.');
  return entries.map(entry => ({ entry, source: alias }));
}

function allTiller(values) {
  const root = process.env.TILLER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourceDir = path.join(root, 'tils');
  if (!fs.statSync(sourceDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Tiller source directory not found: ${sourceDir}`);
  }

  const from = values.from ? values.from.slice(0, 10) : null;
  const to = values.to ? values.to.slice(0, 10) : null;
  const entries = [];
  for (const file of fs.readdirSync(sourceDir).filter(name => name.endsWith('.md')).sort()) {
    const source = file.slice(0, -3);
    const lines = fs.readFileSync(path.join(sourceDir, file), 'utf8').split(/\r?\n/);
    const starts = lines.map((line, index) => /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?: (?:AM|PM))?\] /.test(line) ? index : -1)
      .filter(index => index >= 0);
    for (let index = 0; index < starts.length; index++) {
      const start = starts[index];
      const end = starts[index + 1] ?? lines.length;
      const match = lines[start].match(/^\[(?<date>\d{4}-\d{2}-\d{2}) (?<time>\d{2}:\d{2}:\d{2})(?: (?<meridiem>AM|PM))?\] (?<title>.*)$/);
      if (!match) continue;
      const date = match.groups.date;
      if ((from && date < from) || (to && date > to)) continue;
      let hour = Number(match.groups.time.slice(0, 2));
      if (match.groups.meridiem) hour = (hour % 12) + (match.groups.meridiem === 'PM' ? 12 : 0);
      const time = `${String(hour).padStart(2, '0')}:${match.groups.time.slice(3, 5)}`;
      const titleParts = [];
      const tags = [];
      for (const word of match.groups.title.split(/\s+/)) {
        if (word.startsWith('#') && word.length > 1) tags.push(word);
        else if (word.startsWith('@') && word.length > 1) tags.push(word);
        else titleParts.push(word);
      }
      entries.push({ source, entry: { date, time, title: titleParts.join(' '), body: lines.slice(start + 1, end).join('\n').trim(), tags } });
    }
  }
  return entries;
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      kind: { type: 'string', default: 'journal' },
      output: { type: 'string' },
      directory: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      'config-file': { type: 'string' },
    },
  });
  const [alias] = positionals;
  if (positionals.length !== 1 || (!/^all$/i.test(alias) && !/^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(alias))
    || !['journal', 'event'].includes(values.kind) || (values.output && values.directory)) {
    throw new Error('Usage: node scripts/export-jrnl-calendar.mjs ALIAS [--kind journal|event] [--output FILE | --directory NEW_DIR] [--from DATE] [--to DATE] [--config-file FILE]');
  }
  const entries = /^all$/i.test(alias) ? allTiller(values) : runJrnl(alias, values);

  const records = recordsFor(entries, alias, values.kind);
  if (values.directory) {
    fs.mkdirSync(values.directory);
    for (const record of records) fs.writeFileSync(path.join(values.directory, record.id + '.ics'), calendar([record]));
  } else if (values.output) {
    fs.writeFileSync(values.output, calendar(records));
  } else {
    process.stdout.write(calendar(records));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
