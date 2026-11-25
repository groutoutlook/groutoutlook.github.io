import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calendarStyle, countPublishedDays, renderBlogCalendar } from './blog-calendar.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function readPublicProfile(filename = path.join(root, 'assets/card/card.profile.json')) {
  return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
}
const publicProfile = readPublicProfile();
const profileIntro = profile => [profile.text?.quote, profile.text?.extra].filter(Boolean).join(' ');
const legacyRoutes = ['category', 'subtag', 'post', 'recent'];

export function normalizeBase(value = '/') {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(value)) throw new Error('Base path must be / or a path such as /personal/.');
  return value.endsWith('/') ? value : value + '/';
}

export function withFavicon(html, base = '/') {
  if (html.includes('data-site-icon')) return html;
  const prefix = normalizeBase(base);
  const icons = `<link rel="icon" href="${prefix}favicon.ico" sizes="16x16 32x32 48x48" data-site-icon>
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml" data-site-icon>`;
  return html.replace(/<\/head>/i, `${icons}\n</head>`);
}

export function decodeHtmlText(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"', nbsp: '\u00a0' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const codepoint = entity[1].toLowerCase() === 'x'
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(codepoint) && codepoint > 0 && codepoint <= 0x10ffff
      ? String.fromCodePoint(codepoint)
      : match;
  });
}

function escapeHtmlAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export function ogisImageUrl(title, description, baseUrl = process.env.OGIS_BASE_URL || 'https://img.ogis.dev/') {
  const endpoint = new URL(baseUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('OGIS_BASE_URL must use HTTP or HTTPS.');
  endpoint.search = new URLSearchParams({
    template: 'gradient-forest-centered',
    title,
    subtitle: 'Blog',
    description,
  }).toString();
  return endpoint.toString();
}

export function pageMetadata(html, profile = publicProfile) {
  const heading = html.match(/<h1\b[^>]*class=["']til-title["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g, '');
  const title = decodeHtmlText(heading || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || 'Blog');
  const descriptionMatch = html.match(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*\bcontent=["']([^"']*)["'][^>]*>/i);
  const description = decodeHtmlText(descriptionMatch?.[1] || profileIntro(profile));
  return { title, description, hasDescription: Boolean(descriptionMatch) };
}

function withOpenGraph(html, ogisBaseUrl, preparedImage, profile) {
  if (html.includes('data-ogis-meta')) return html;
  const { title, description, hasDescription } = pageMetadata(html, profile);
  const image = escapeHtmlAttribute(preparedImage || ogisImageUrl(title, description, ogisBaseUrl));
  const escapedTitle = escapeHtmlAttribute(title);
  const escapedDescription = escapeHtmlAttribute(description);
  const type = /class=["']til-content\b/i.test(html) ? 'article' : 'website';
  const tags = `<meta property="og:type" content="${type}" data-ogis-meta>
<meta property="og:site_name" content="${escapeHtmlAttribute(profile.sharing?.blog_title || 'Blog')}" data-ogis-meta>
<meta property="og:title" content="${escapedTitle}" data-ogis-meta>
<meta property="og:description" content="${escapedDescription}" data-ogis-meta>
<meta property="og:image" content="${image}" data-ogis-meta>
<meta property="og:image:width" content="1200" data-ogis-meta>
<meta property="og:image:height" content="630" data-ogis-meta>
<meta name="twitter:card" content="summary_large_image" data-ogis-meta>${hasDescription ? '' : `\n<meta name="description" content="${escapedDescription}" data-ogis-meta>`}`;
  return html.replace(/<\/head>/i, `${tags}\n</head>`);
}

export function rewriteBlog(html, base = '/', ogisBaseUrl = process.env.OGIS_BASE_URL || publicProfile.sharing?.ogis_base_url || 'https://img.ogis.dev/', preparedImage, profile = publicProfile) {
  base = normalizeBase(base);
  const blog = `${base}blog/`;
  const owned = /^(?:category\/|subtag\/|post\/|recent\/|style\.css(?:[?#]|$)|syntect\.css(?:[?#]|$)|index\.js(?:[?#]|$)|feed\.rss(?:[?#]|$))/;
  html = html.replace(/\b(href|src|action)=(['"])\/([^'"\s]*)\2/g, (match, attr, quote, url) => {
    let target;
    if (url.startsWith('blog/')) target = blog + url.slice(5);
    else if (!url || url.startsWith('#') || url.startsWith('?') || owned.test(url)) target = blog + url;
    return target ? `${attr}=${quote}${target}${quote}` : match;
  });
  html = html.replace(/(<a\b[^>]*class="top-link"[^>]*>)All TILs<\/a>/g,
    `<a class="top-link" href="${base}">Home</a>$1Blog</a><a class="top-link" href="${base}map/">Map</a>`);
  html = html.replace(/(<a\b[^>]*class="top-link"[^>]*href=")[^"]*(">Home<\/a>)/g, `$1${base}$2`);
  html = html.replace(/<title>TILs - Page (\d+)<\/title>/, '<title>Blog - Page $1</title>')
    .replace('<h1>TILs</h1>', '<h1>Blog</h1>')
    .replace('A small wall garden grown from the configured <code>jrnl</code> journals.', escapeHtmlAttribute(profileIntro(profile)));
  return withFavicon(withOpenGraph(html, ogisBaseUrl, preparedImage, profile), base);
}

const topicsStart = /<details\b[^>]*\bid=["']topics["'][^>]*>/i;
const journalWeavesPath = 'journal-weaves';
const topicCloudStyle = `<style>
.topic-cloud { margin: 1rem 0; }
.topic-cloud svg, .topic-cloud img { display: block; width: 100%; height: auto; }
.topic-cloud a { pointer-events: bounding-box; }
.topic-cloud a:is(:hover, :focus-visible) path { stroke: currentColor; stroke-width: 1.25; }
.topic-cloud .topic-cloud-dark, html[data-theme="dark"] .topic-cloud-light { display: none; }
html[data-theme="dark"] .topic-cloud .topic-cloud-dark { display: block; }
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) .topic-cloud-light { display: none; }
  html:not([data-theme="light"]) .topic-cloud .topic-cloud-dark { display: block; }
}
.journal-weave-index { columns: 15rem; padding-inline-start: 1.5rem; }
.journal-weave-index li { break-inside: avoid; padding-block: .2rem; overflow-wrap: anywhere; }
.journal-tag-counts { border-collapse: collapse; }
.journal-tag-counts th, .journal-tag-counts td { padding: .35rem .75rem; text-align: start; overflow-wrap: anywhere; }
.journal-tag-counts td:last-child { text-align: end; font-variant-numeric: tabular-nums; }
</style>`;
function topicCloud(name, directory, links) {
  const images = ['light', 'dark'].map(theme => {
    const source = fs.readFileSync(path.join(directory, `${theme}.svg`), 'utf8');
    // Wordcloud emits one titled glyph path for each placed word.
    const words = [...source.matchAll(/<path fill="(#[\da-f]{6})" d="([a-z\d.,\s+-]+)"><title>([^<]*)<\/title><\/path>/gi)]
      .map(([, fill, outline, title]) => {
        const tag = decodeHtmlText(title);
        const href = links.get(tag)?.[0]?.href;
        const glyph = `<path fill="${fill}" d="${outline}"><title>${escapeHtmlAttribute(tag)}</title></path>`;
        return href ? `<a href="${href}" aria-label="${escapeHtmlAttribute(tag)}">${glyph}</a>` : glyph;
      });
    if (!words.length) return `<img class="topic-cloud-${theme}" src="/blog/${journalWeavesPath}/${name}/${theme}.svg" alt="${name} tag cloud" width="900" height="320">`;
    return `<svg class="topic-cloud-${theme}" viewBox="0 0 900 320" width="900" height="320" aria-label="${name} tag cloud">${words.join('\n')}</svg>`;
  });
  return `<figure class="topic-cloud">${images.join('\n')}</figure>`;
}

function withBlogVisualizations(html, base) {
  const overview = `<p><a href="${base}blog/visualizations/">Blog visualizations</a></p>`;
  return topicsStart.test(html)
    ? html.replace(topicsStart, match => `${overview}\n${match}`)
    : html.replace(/<h1>Blog<\/h1>/, match => `${match}\n${overview}`);
}

function blogVisualizations(base, ogisBaseUrl, profile, cover, weaves, calendar) {
  const list = weaves.map(({ name }) => `<li><a href="/blog/${journalWeavesPath}/${name}/">${name}</a></li>`).join('\n');
  const index = weaves.length ? `<section id="journal-weaves"><h2>Journal word clouds</h2>
<ul class="journal-weave-index">${list}</ul></section>` : '';
  return visualizationPage('Blog visualizations', `${index}\n${calendar}`, `${weaves.length ? topicCloudStyle : ''}\n${calendar ? calendarStyle : ''}`, base, ogisBaseUrl, profile, cover);
}

function journalWeavePage({ name, parent, posts, tags }, blog, base, ogisBaseUrl, profile, cover) {
  const links = new Map(tags.map(([tag, , routes]) => [tag, ['category', 'subtag'].flatMap(kind => {
    if (routes && !routes[kind]) return [];
    const parts = (routes?.[kind] ?? tag).replace(/\/$/, '').split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || /[\\:\u0000]/.test(part))) return [];
    return fs.existsSync(path.join(blog, kind, ...parts, 'index.html'))
      ? [{ kind, href: `/blog/${kind}/${parts.map(encodeURIComponent).join('/')}/` }] : [];
  })]));
  const rows = tags.map(([tag, count]) => {
    const label = escapeHtmlAttribute(tag);
    const [first, second] = links.get(tag);
    const primary = first ? `<a href="${first.href}">${label}</a>` : label;
    const other = second ? ` <a href="${second.href}" aria-label="${label} in-topic posts">(in-topic)</a>` : '';
    return `<tr><th scope="row">${primary}${other}</th><td>${count}</td></tr>`;
  }).join('\n');
  const content = `<p><a href="/blog/visualizations/#journal-weaves">All journal word clouds</a> · <a href="/blog/category/${encodeURIComponent(parent)}/">Browse journal posts</a></p>
${topicCloud(name, path.join(blog, journalWeavesPath, name), links)}
<p>${posts} published ${posts === 1 ? 'entry' : 'entries'}</p>
<table class="journal-tag-counts"><thead><tr><th scope="col">Tag</th><th scope="col">Posts</th></tr></thead>
<tbody>${rows}</tbody></table>`;
  return visualizationPage(name, content, topicCloudStyle, base, ogisBaseUrl, profile, cover);
}

function visualizationPage(title, content, styles, base, ogisBaseUrl, profile, cover) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="/blog/style.css">
${styles}</head>
<body><script src="/blog/index.js"></script>
<nav class="top-links" aria-label="Site navigation">
  <a class="top-link" href="/blog/">All TILs</a>
  <label class="theme-toggle"><input type="checkbox" role="switch" onchange="setTheme(this.checked ? 'dark' : 'light')"><span>Dark mode</span></label>
</nav>
<main><h1>${title}</h1>
${content}
</main></body></html>\n`;
  return rewriteBlog(html, base, ogisBaseUrl, cover, profile);
}

function page(title, body, base) {
  return withFavicon(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark"><title>${title}</title><link rel="stylesheet" href="${base}theme.css">
<style>body{max-width:48rem;margin:auto;padding:clamp(20px,5vw,56px);font:16px/1.6 system-ui,sans-serif}nav{display:flex;flex-wrap:wrap;gap:20px}a{color:var(--green);text-underline-offset:4px}a:focus-visible{outline:2px solid;outline-offset:5px}h1{margin-top:48px}li{padding:12px 0}p{color:var(--muted)}</style></head>
<body><nav aria-label="Site navigation"><a href="${base}">Home</a><a href="${base}blog/">Blog</a><a href="${base}map/">Map</a></nav><main>${body}</main></body></html>\n`, base);
}

export function prepareOutput(output, projectRoot = root) {
  output = path.resolve(output);
  const marker = path.join(output, '.personal-site-build');
  if (fs.existsSync(output)) {
    if (!fs.lstatSync(output).isDirectory() || fs.lstatSync(output).isSymbolicLink()) throw new Error('Output must be a real directory.');
    if (fs.statSync(marker, { throwIfNoEntry: false })?.isFile()) {
      fs.rmSync(output, { recursive: true });
    } else {
      if (output !== path.resolve(projectRoot, 'public')) throw new Error(`Refusing to replace an unmarked output directory: ${output}`);
      // Older/manual builds have no marker. Preserve them rather than deleting
      // their contents or requiring the user to bypass the output guard.
      fs.mkdirSync(path.join(projectRoot, '.cache'), { recursive: true });
      const backup = fs.mkdtempSync(path.join(projectRoot, '.cache/public-backup-'));
      fs.renameSync(output, path.join(backup, 'public'));
      console.log(`Preserved unmarked public output in ${path.join(backup, 'public')}.`);
    }
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(marker, 'Generated by scripts/build-site.mjs\n');
}

export function assemble({ blogSource = path.join(root, 'site'), cardSource = path.join(root, 'assets/card'), output = path.join(root, 'public'), basePath = '/', ogisBaseUrl = process.env.OGIS_BASE_URL || 'https://img.ogis.dev/', siteUrl = process.env.SITE_URL || 'https://groutoutlook.github.io/', quiet = false } = {}) {
  const profile = readPublicProfile(path.join(cardSource, 'card.profile.json'));
  const intro = escapeHtmlAttribute(profileIntro(profile));
  const base = normalizeBase(basePath);
  const site = new URL(base, siteUrl);
  if (!['http:', 'https:'].includes(site.protocol)) throw new Error('SITE_URL must use HTTP or HTTPS.');
  for (const file of [path.join(blogSource, 'index.html'), path.join(cardSource, 'app.html'), path.join(cardSource, 'card.wasm')]) {
    if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Import a card release and keep the generated site/ blog.`);
  }
  output = path.resolve(output);
  for (const source of [blogSource, cardSource, path.join(root, '.git'), path.join(root, 'scripts')]) {
    const relative = path.relative(output, path.resolve(source));
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Output must not contain a source directory.');
    if (output.startsWith(path.resolve(source) + path.sep)) throw new Error('Output must not be inside a source directory.');
  }
  prepareOutput(output);
  fs.cpSync(cardSource, output, { recursive: true });
  function cardMetadata(html, route = '') {
    if (!fs.existsSync(path.join(cardSource, 'card.og.png')) || !html.includes('property="og:image"')) return html;
    const image = escapeHtmlAttribute(new URL('card.og.png', site).href);
    const url = escapeHtmlAttribute(new URL(route, site).href);
    return html.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${image}$2`)
      .replace(/<\/head>/i, `<meta property="og:url" content="${url}"><meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="${escapeHtmlAttribute(profile.profile?.name || 'Card')}"><meta name="twitter:image" content="${image}">\n</head>`);
  }
  for (const name of fs.readdirSync(cardSource).filter(name => name.endsWith('.html'))) {
    fs.writeFileSync(path.join(output, name), withFavicon(cardMetadata(fs.readFileSync(path.join(cardSource, name), 'utf8'), name), base));
  }
  for (const name of ['favicon.svg', 'favicon.ico']) fs.copyFileSync(path.join(root, 'assets/site', name), path.join(output, name));
  fs.writeFileSync(path.join(output, 'share-preview.html'), withFavicon(fs.readFileSync(path.join(root, 'assets/site/share-preview.html'), 'utf8'), base));
  const coversRoot = path.join(root, 'assets/site/og');
  const covers = fs.existsSync(path.join(coversRoot, 'index.json'))
    ? JSON.parse(fs.readFileSync(path.join(coversRoot, 'index.json'), 'utf8')) : {};
  if (fs.existsSync(coversRoot)) fs.cpSync(coversRoot, path.join(output, 'og'), { recursive: true });
  function navigation(html, home = false) {
    html = withFavicon(cardMetadata(html, home ? 'wasm.html' : ''), base);
    const links = `${home ? `<a href="${base}">Home</a>` : ''}<a href="${base}blog/">Blog</a><a href="${base}map/">Map</a>`;
    html = html.replace('</head>', '<style>body>nav.site-links{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:16px;width:min(1440px,calc(100vw - 64px));margin:0 auto;color:var(--muted);font-size:13px}body>nav.site-links a{color:inherit;text-decoration:none}body>nav.site-links a:hover{color:var(--green)}body>nav.site-links a:focus-visible{outline:2px solid var(--green);outline-offset:5px}@media(max-width:760px){body>nav.site-links{width:calc(100vw - 24px)}}</style></head>');
    return html.replace(/(<body\b[^>]*>)/i, `$1<nav class="site-links" aria-label="Site navigation">${links}</nav>`);
  }
  const app = navigation(fs.readFileSync(path.join(cardSource, 'app.html'), 'utf8'));
  fs.writeFileSync(path.join(output, 'index.html'), app);
  fs.writeFileSync(path.join(output, 'app.html'), app);
  for (const filename of ['wasm.html', 'index.html']) {
    const html = navigation(fs.readFileSync(path.join(cardSource, filename), 'utf8'), true);
    fs.writeFileSync(path.join(output, filename === 'index.html' ? 'preview.html' : filename), html);
  }
  fs.mkdirSync(path.join(output, 'preview'));
  fs.writeFileSync(path.join(output, 'preview/index.html'), page('Card preview', `<script>location.replace(${JSON.stringify(base + 'preview.html')}+location.search+location.hash)</script><p><a href="${base}preview.html">Open the card preview</a></p>`, base));

  const publishedDays = new Map();
  let landing;
  let pages = 0;
  function copyBlog(directory, relative = '') {
    fs.mkdirSync(path.join(output, 'blog', relative), { recursive: true });
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const next = path.join(relative, entry.name);
      const source = path.join(directory, entry.name), destination = path.join(output, 'blog', next);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in generated blog: ${next}`);
      if (entry.isDirectory()) copyBlog(source, next);
      else if (entry.name.endsWith('.html')) {
        const cover = covers[next.split(path.sep).join('/')] || covers['*'];
        const sourceHtml = fs.readFileSync(source, 'utf8');
        const route = next.split(path.sep).join('/');
        if (route === 'index.html' || /^recent\/\d+\/index\.html$/.test(route)) countPublishedDays(sourceHtml, publishedDays);
        const html = rewriteBlog(sourceHtml, base, ogisBaseUrl, cover ? new URL(`og/${cover}`, site).href : undefined, profile);
        if (route === 'index.html') landing = html;
        else fs.writeFileSync(destination, html);
        pages++;
      } else if (entry.name === 'feed.rss') {
        const rss = fs.readFileSync(source, 'utf8').replace(/<(link|guid)([^>]*)>\/(?:blog\/)?([^<]*)<\/(?:link|guid)>/g, `<$1$2>${base}blog/$3</$1>`);
        fs.writeFileSync(destination, rss);
      } else fs.copyFileSync(source, destination);
    }
  }
  copyBlog(blogSource);
  const weaveDirectory = path.join(output, 'blog', journalWeavesPath);
  const manifest = path.join(weaveDirectory, 'index.json');
  const weaves = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).filter(({ name }) =>
    /^[\w-]+$/.test(name) && ['light.svg', 'dark.svg'].every(file => fs.existsSync(path.join(weaveDirectory, name, file)))) : [];
  const calendar = renderBlogCalendar(publishedDays);
  const hasVisualizations = weaves.length > 0 || Boolean(calendar);
  fs.writeFileSync(path.join(output, 'blog', 'index.html'),
    hasVisualizations ? withBlogVisualizations(landing, base) : landing);
  if (hasVisualizations) {
    const directory = path.join(output, 'blog', 'visualizations');
    const cover = covers['*'] ? new URL(`og/${covers['*']}`, site).href : undefined;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), blogVisualizations(base, ogisBaseUrl, profile, cover, weaves, calendar));
    for (const weave of weaves) {
      fs.writeFileSync(path.join(weaveDirectory, weave.name, 'index.html'), journalWeavePage(weave, path.join(output, 'blog'), base, ogisBaseUrl, profile, cover));
    }
  }
  const visualizations = hasVisualizations ? `<li><a href="${base}blog/visualizations/">Blog visualizations</a></li>` : '';
  fs.mkdirSync(path.join(output, 'map'));
  fs.writeFileSync(path.join(output, 'map/index.html'), page('Site map', `<h1>Site map</h1><p>A way into the card and the blog.</p><ul><li><a href="${base}">Card / Home</a><p>About me, contact details, and the animated card.</p></li><li><a href="${base}wasm.html">Interactive WASM card</a><p>The Rust card running in your browser.</p></li><li><a href="${base}blog/">Blog / TILs</a><p>${intro}</p></li><li><a href="${base}blog/#topics">Browse blog topics</a></li>${visualizations}<li><a href="${base}blog/feed.rss">Blog RSS feed</a></li><li><a href="${base}preview.html">Card render modes and exports</a></li></ul>`, base));
  const redirect = `<script>(()=>{const base=${JSON.stringify(base)},p=location.pathname.slice(base.length);if(location.pathname.startsWith(base)&&${JSON.stringify(legacyRoutes)}.includes(p.split('/')[0]))location.replace(base+'blog/'+p+location.search+location.hash)})()</script>`;
  fs.writeFileSync(path.join(output, '404.html'), page('Page not found', `${redirect}<h1>Page not found</h1><p>The TILs now live under <a href="${base}blog/">Blog</a>. Visit the <a href="${base}map/">site map</a> to find your way.</p>`, base));
  if (fs.existsSync(path.join(output, 'blog/feed.rss'))) fs.copyFileSync(path.join(output, 'blog/feed.rss'), path.join(output, 'feed.rss'));
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  if (!quiet) console.log(`Assembled card + ${pages} blog pages + /map/ in ${output} (base ${base}).`);
  return { output, pages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some((arg, index) => index % 2 === 0 && !['--base-path', '--outdir', '--site-url'].includes(arg)) || args.length % 2) throw new Error('Usage: node scripts/build-site.mjs [--base-path /] [--outdir public] [--site-url https://example.org/]');
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, index) => [args[index * 2], args[index * 2 + 1]]));
  assemble({ basePath: options['--base-path'] || '/', output: options['--outdir'] || path.join(root, 'public'), siteUrl: options['--site-url'] || process.env.SITE_URL });
}
