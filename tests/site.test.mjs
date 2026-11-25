import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { assemble, normalizeBase, ogisImageUrl, rewriteBlog, withFavicon } from '../scripts/build-site.mjs';

import { topicCloudInput } from '../scripts/build-topic-cloud.mjs';

const sample = `<head><title>TILs - Page 1</title><link href="/style.css"></head><body>
<nav><a class="top-link" href="/">All TILs</a></nav><h1>TILs</h1>
<a href="/category/rust">Rust</a><a href="/post/hello#section">Post</a><a href="/recent/2/">Next</a>
<a href="/subtag/wasm">WASM</a><script src="/index.js"></script>
<a href="https://example.com/post/hello">External</a><a href="//example.com/">Protocol relative</a>
<a href="/unrelated">Unrelated</a><a href="#topics">Topics</a></body>`;

const topicDetails = `<details class="by-topic" id="topics"><summary>TILs by topic</summary>
<a href="/category/rust"><span>Rust</span><span class="til-tag-count">4</span></a>
<a href="/category/cpp"><span>C&#43;&#43; &amp; Tools</span><span class="til-tag-count">12</span></a>
</details><details id="in-topic-tags"><a><span>Body only</span><span class="til-tag-count">20</span></a></details>`;

test('Glyphweave uses canonical master tags weighted by published parent-tag counts', () => {
  const dictionary = `[master_tags.rust]
source = "RustJournal.md"
[master_tags."programming-tools"]
parent_tag = "C++ & Tools"
[master_tags.'unpublished']
parent_tag = "Body only"
aliases = ["Rust"]`;
  const html = topicDetails.replace('</details>', '<a><span>Miscellaneous</span><span class="til-tag-count">99</span></a></details>');
  assert.deepEqual(topicCloudInput(html, dictionary), [['rust', 4], ['programming-tools', 12]]);
  assert.deepEqual(topicCloudInput(sample, dictionary), []);
  assert.throws(() => topicCloudInput(html, ''), /No master tag tables/);
});

test('blog routes move together while external links and anchors stay intact', () => {
  const html = rewriteBlog(sample);
  for (const url of ['/blog/', '/blog/style.css', '/blog/category/rust', '/blog/post/hello#section', '/blog/recent/2/', '/blog/subtag/wasm', '/blog/index.js', '/map/']) assert.ok(html.includes(`"${url}"`), url);
  for (const url of ['https://example.com/post/hello', '//example.com/', '/unrelated', '#topics']) assert.ok(html.includes(`"${url}"`), url);
  assert.ok(html.includes('<h1>Blog</h1>'));
  assert.ok(html.includes('<title>Blog - Page 1</title>'));
  assert.ok(html.includes('property="og:image"'));
  assert.ok(html.includes('template=gradient-forest-centered'));
  assert.equal((html.match(/data-ogis-meta/g) || []).length, 9);
  assert.equal(rewriteBlog(html), html, 'rewriting is idempotent');
});

test('OGIS page images use decoded title/description and a configurable HTTP endpoint', () => {
  const html = rewriteBlog('<html><head><title>TIL: Tom &amp; Jerry &#x1F436;</title><meta name="description" content="A &quot;useful&quot; note"></head><body></body></html>', '/personal/', 'https://ogis.example/images');
  const content = html.match(/property="og:image" content="([^"]+)"/)[1].replaceAll('&amp;', '&');
  const image = new URL(content);
  assert.equal(image.origin, 'https://ogis.example');
  assert.equal(image.pathname, '/images');
  assert.equal(image.searchParams.get('template'), 'gradient-forest-centered');
  assert.equal(image.searchParams.get('title'), 'TIL: Tom & Jerry 🐶');
  assert.equal(image.searchParams.get('description'), 'A "useful" note');
  assert.throws(() => ogisImageUrl('x', 'y', 'file:///tmp/image'), /HTTP or HTTPS/);
});

test('configured blog URLs and project-site base paths do not double prefix', () => {
  assert.equal(normalizeBase('/personal'), '/personal/');
  assert.throws(() => normalizeBase('https://example.com'));
  const html = rewriteBlog(sample.replaceAll('href="/post/', 'href="/blog/post/'), '/personal/');
  assert.ok(html.includes('href="/personal/blog/post/hello#section"'));
  assert.ok(html.includes('href="/personal/map/"'));
  assert.ok(!html.includes('/blog/blog/'));
});

test('favicon is shared, works under a subpath, and is added only once', () => {
  for (const base of ['/', '/personal/']) {
    const html = withFavicon('<html><head><title>Page</title></head><body></body></html>', base);
    assert.ok(html.includes(`href="${base}favicon.svg"`));
    assert.ok(html.includes(`href="${base}favicon.ico"`));
    assert.equal(withFavicon(html, base), html);
    assert.equal((html.match(/rel="icon"/g) || []).length, 2);
  }
});

test('assembled routes, feed, navigation and legacy redirects work at root and subpaths', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-site-test-'));
  try {
    const blogSource = path.join(temp, 'source-blog'), cardSource = path.join(temp, 'source-card');
    fs.mkdirSync(path.join(blogSource, 'post/hello'), { recursive: true });
    fs.mkdirSync(cardSource);
    const recent = '<ol class="recent-list"><li class="recent-til"><span class="til-date">2024-02-29 10:00:00 AM<br><span class="updated-at">Updated at 2024-03-02</span></span></li></ol>';
    const landing = sample.replace('</body>', `${topicDetails}${recent}</body>`);
    fs.mkdirSync(path.join(blogSource, 'recent/2'), { recursive: true });
    fs.writeFileSync(path.join(blogSource, 'recent/2/index.html'), sample.replace('</body>', `${recent}</body>`));
    fs.writeFileSync(path.join(blogSource, 'index.html'), landing);
    for (const name of ['topic-cloud.svg', 'topic-cloud-dark.svg']) fs.writeFileSync(path.join(blogSource, name), '<svg/>');
    fs.writeFileSync(path.join(blogSource, 'post/hello/index.html'), landing);
    fs.writeFileSync(path.join(blogSource, 'style.css'), 'body{}');
    fs.writeFileSync(path.join(blogSource, 'feed.rss'), '<rss><channel><link>/</link><item><link>/post/hello</link><guid isPermaLink="true">/post/hello</guid></item></channel></rss>');
    fs.writeFileSync(path.join(cardSource, 'app.html'), '<html><head></head><body><main>Card</main><nav class="app-actions"></nav></body></html>');
    fs.writeFileSync(path.join(cardSource, 'index.html'), '<html><head></head><body><div class="actions"></div></body></html>');
    fs.writeFileSync(path.join(cardSource, 'wasm.html'), '<html><head></head><body><header></header></body></html>');
    fs.writeFileSync(path.join(cardSource, 'card.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    for (const basePath of ['/', '/personal/']) {
      const output = path.join(temp, basePath === '/' ? 'root' : 'subpath');
      assert.equal(assemble({ blogSource, cardSource, output, basePath }).pages, 3);
      assert.equal(assemble({ blogSource, cardSource, output, basePath }).pages, 3, 'repeat assembly replaces only generated output');
      for (const file of ['index.html', 'wasm.html', 'preview.html', 'map/index.html', 'blog/index.html', 'blog/post/hello/index.html', 'blog/style.css', 'feed.rss', '404.html', '.nojekyll', 'favicon.svg', 'favicon.ico']) assert.ok(fs.existsSync(path.join(output, file)), file);
      for (const file of ['index.html', 'wasm.html', 'preview.html', 'blog/post/hello/index.html', 'map/index.html']) {
        const html = fs.readFileSync(path.join(output, file), 'utf8');
        assert.ok(html.includes(`href="${basePath}blog/"`), file);
        assert.ok(html.includes(`href="${basePath}map/"`), file);
        assert.ok(html.includes(`href="${basePath}favicon.svg"`), file);
        assert.ok(html.includes(`href="${basePath}favicon.ico"`), file);
      }
      const appHtml = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
      const siteNav = appHtml.indexOf('<nav class="site-links"');
      assert.ok(siteNav >= 0 && siteNav < appHtml.indexOf('<main>'), 'site navigation stays outside the card');
      assert.ok(siteNav < appHtml.indexOf('<nav class="app-actions"'), 'site navigation stays separate from card controls');
      assert.deepEqual([...fs.readFileSync(path.join(output, 'favicon.ico')).subarray(0, 6)], [0, 0, 1, 0, 3, 0]);
      assert.ok(fs.readFileSync(path.join(output, 'feed.rss'), 'utf8').includes(`<link>${basePath}blog/post/hello</link>`));
      const landingHtml = fs.readFileSync(path.join(output, 'blog/index.html'), 'utf8');
      assert.match(landingHtml, /src="topic-cloud\.svg"/);
      assert.match(landingHtml, /src="topic-cloud-dark\.svg"/);
      assert.ok(landingHtml.includes(`href="${basePath}blog/visualizations/"`));
      const visualizations = fs.readFileSync(path.join(output, 'blog/visualizations/index.html'), 'utf8');
      assert.ok(visualizations.includes(`src="${basePath}blog/topic-cloud.svg"`));
      assert.ok(visualizations.includes(`href="${basePath}blog/#topics"`));
      assert.match(visualizations, /February 2024 · 2 posts/);
      assert.match(visualizations, /2024-02-29 · 2 posts/);
      assert.doesNotMatch(visualizations, /March 2024/);
      const map = fs.readFileSync(path.join(output, 'map/index.html'), 'utf8');
      assert.ok(map.includes(`href="${basePath}blog/visualizations/"`));
      for (const name of ['topic-cloud.svg', 'topic-cloud-dark.svg']) assert.ok(fs.existsSync(path.join(output, 'blog', name)));
      const postHtml = fs.readFileSync(path.join(output, 'blog/post/hello/index.html'), 'utf8');
      assert.ok(postHtml.includes('property="og:image"'));
      assert.doesNotMatch(postHtml, /class="topic-cloud"/);
      assert.ok(postHtml.includes(`${basePath}og/blog.png`));
      const script = fs.readFileSync(path.join(output, '404.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
      let redirected;
      const location = { pathname: `${basePath}post/hello`, search: '?a=1', hash: '#section', replace: value => { redirected = value; } };
      vm.runInNewContext(script, { location });
      assert.equal(redirected, `${basePath}blog/post/hello?a=1#section`);
      redirected = undefined;
      location.pathname = `${basePath}unknown`;
      vm.runInNewContext(script, { location });
      assert.equal(redirected, undefined, 'unknown paths do not redirect');
    }
    fs.unlinkSync(path.join(blogSource, 'topic-cloud-dark.svg'));
    const noCloud = assemble({ blogSource, cardSource, output: path.join(temp, 'no-cloud'), quiet: true }).output;
    const calendarOnly = fs.readFileSync(path.join(noCloud, 'blog/visualizations/index.html'), 'utf8');
    assert.match(calendarOnly, /Posting calendar/);
    assert.doesNotMatch(calendarOnly, /topic-cloud\.svg/);
    assert.match(fs.readFileSync(path.join(noCloud, 'map/index.html'), 'utf8'), /blog\/visualizations/);

    assert.throws(() => assemble({ blogSource, cardSource, output: temp }), /must not contain/);
    assert.throws(() => assemble({ blogSource, cardSource, output: path.join(blogSource, 'public') }), /inside a source/);
    const unrelated = path.join(temp, 'unrelated');
    fs.mkdirSync(unrelated);
    assert.throws(() => assemble({ blogSource, cardSource, output: unrelated }), /unmarked/);
    assert.equal(fs.readFileSync(path.join(blogSource, 'index.html'), 'utf8'), landing, 'source blog is unchanged');
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});
