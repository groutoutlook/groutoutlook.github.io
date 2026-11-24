const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const calendarStyle = `<style>
.blog-calendar { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: 1rem; }
.blog-calendar table { width: 100%; table-layout: fixed; border-spacing: 0.2rem; font-size: 0.8rem; }
.blog-calendar caption { text-align: left; font-weight: bold; padding-bottom: 0.35rem; }
.blog-calendar th { color: var(--muted); font-size: 0.7rem; }
.blog-calendar td, .blog-calendar th { border: 0; padding: 0; text-align: center; }
.blog-calendar time { display: block; padding-block: 0.25rem; border-radius: 0.25rem; background: var(--surface); font-variant-numeric: tabular-nums; }
.blog-calendar [data-level="1"] { background: color-mix(in srgb, var(--accent) 16%, var(--page-bg)); }
.blog-calendar [data-level="2"] { background: color-mix(in srgb, var(--accent) 30%, var(--page-bg)); }
.blog-calendar [data-level="3"] { background: color-mix(in srgb, var(--accent) 46%, var(--page-bg)); }
.blog-calendar .calendar-count { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
</style>`;

export function countPublishedDays(html, counts) {
  const recent = html.match(/<ol\s+class="recent-list">([\s\S]*?)<\/ol>/)?.[1] ?? '';
  const dates = recent.matchAll(/<li\s+class="recent-til">\s*<span\s+class="til-date">(\d{4}-\d{2}-\d{2})(?=\s|<)/g);
  for (const [, day] of dates) {
    const date = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
}

function monthKey(date) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function renderMonth(month, counts) {
  const year = Math.floor(month / 12);
  const first = new Date(Date.UTC(2000, month % 12, 1));
  first.setUTCFullYear(year);
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const cells = Array((first.getUTCDay() + 6) % 7).fill('<td></td>');
  let total = 0;
  for (const date = new Date(first); date < next; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    const count = counts.get(day) ?? 0;
    total += count;
    const level = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : 3;
    const posts = `${count} ${count === 1 ? 'post' : 'posts'}`;
    cells.push(`<td><time datetime="${day}" data-level="${level}" title="${day} · ${posts}">${date.getUTCDate()}<span class="calendar-count">, ${posts}</span></time></td>`);
  }
  while (cells.length % 7) cells.push('<td></td>');
  const weeks = [];
  for (let offset = 0; offset < cells.length; offset += 7) weeks.push(`<tr>${cells.slice(offset, offset + 7).join('')}</tr>`);
  return `<table><caption>${monthName.format(first)} · ${total} ${total === 1 ? 'post' : 'posts'}</caption>
<thead><tr>${weekdays.map(day => `<th scope="col">${day}</th>`).join('')}</tr></thead>
<tbody>${weeks.join('\n')}</tbody></table>`;
}

export function renderBlogCalendar(counts) {
  if (counts.size === 0) return '';
  const days = [...counts.keys()].sort();
  const first = monthKey(new Date(days[0]));
  const latest = monthKey(new Date(days.at(-1)));
  const months = [];
  for (let month = Math.max(first, latest - 11); month <= latest; month++) months.push(renderMonth(month, counts));
  return `<section aria-labelledby="blog-calendar-heading"><h2 id="blog-calendar-heading">Posting calendar</h2>
<p>Published posts by original entry date. Stronger shading marks days with more posts.</p>
<div class="blog-calendar">${months.join('\n')}</div></section>`;
}
