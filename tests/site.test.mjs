import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { assemble, normalizeBase, rewriteBlog, withFavicon } from '../scripts/build-site.mjs';

const sample = `<head><title>TILs - Page 1</title><link href="/style.css"></head><body>
<nav><a class="top-link" href="/">All TILs</a></nav><h1>TILs</h1>
<a href="/category/rust">Rust</a><a href="/post/hello#section">Post</a><a href="/recent/2/">Next</a>
<a href="/subtag/wasm">WASM</a><script src="/index.js"></script>
<a href="https://example.com/post/hello">External</a><a href="//example.com/">Protocol relative</a>
<a href="/unrelated">Unrelated</a><a href="#topics">Topics</a></body>`;

test('blog routes move together while external links and anchors stay intact', () => {
  const html = rewriteBlog(sample);
  for (const url of ['/blog/', '/blog/style.css', '/blog/category/rust', '/blog/post/hello#section', '/blog/recent/2/', '/blog/subtag/wasm', '/blog/index.js', '/map/']) assert.ok(html.includes(`"${url}"`), url);
  for (const url of ['https://example.com/post/hello', '//example.com/', '/unrelated', '#topics']) assert.ok(html.includes(`"${url}"`), url);
  assert.ok(html.includes('<h1>Blog</h1>'));
  assert.ok(html.includes('<title>Blog - Page 1</title>'));
  assert.equal(rewriteBlog(html), html, 'rewriting is idempotent');
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
    fs.writeFileSync(path.join(blogSource, 'index.html'), sample);
    fs.writeFileSync(path.join(blogSource, 'post/hello/index.html'), sample);
    fs.writeFileSync(path.join(blogSource, 'style.css'), 'body{}');
    fs.writeFileSync(path.join(blogSource, 'feed.rss'), '<rss><channel><link>/</link><item><link>/post/hello</link><guid isPermaLink="true">/post/hello</guid></item></channel></rss>');
    fs.writeFileSync(path.join(cardSource, 'app.html'), '<head></head><main>Card</main><nav class="app-actions"></nav>');
    fs.writeFileSync(path.join(cardSource, 'index.html'), '<head></head><div class="actions"></div>');
    fs.writeFileSync(path.join(cardSource, 'wasm.html'), '<head></head><header></header>');
    fs.writeFileSync(path.join(cardSource, 'card.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    for (const basePath of ['/', '/personal/']) {
      const output = path.join(temp, basePath === '/' ? 'root' : 'subpath');
      assert.equal(assemble({ blogSource, cardSource, output, basePath }).pages, 2);
      assert.equal(assemble({ blogSource, cardSource, output, basePath }).pages, 2, 'repeat assembly replaces only generated output');
      for (const file of ['index.html', 'wasm.html', 'preview.html', 'map/index.html', 'blog/index.html', 'blog/post/hello/index.html', 'blog/style.css', 'feed.rss', '404.html', '.nojekyll', 'favicon.svg', 'favicon.ico']) assert.ok(fs.existsSync(path.join(output, file)), file);
      for (const file of ['index.html', 'wasm.html', 'preview.html', 'blog/post/hello/index.html', 'map/index.html']) {
        const html = fs.readFileSync(path.join(output, file), 'utf8');
        assert.ok(html.includes(`href="${basePath}blog/"`), file);
        assert.ok(html.includes(`href="${basePath}map/"`), file);
        assert.ok(html.includes(`href="${basePath}favicon.svg"`), file);
        assert.ok(html.includes(`href="${basePath}favicon.ico"`), file);
      }
      assert.deepEqual([...fs.readFileSync(path.join(output, 'favicon.ico')).subarray(0, 6)], [0, 0, 1, 0, 3, 0]);
      assert.ok(fs.readFileSync(path.join(output, 'feed.rss'), 'utf8').includes(`<link>${basePath}blog/post/hello</link>`));
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
    assert.throws(() => assemble({ blogSource, cardSource, output: temp }), /must not contain/);
    assert.throws(() => assemble({ blogSource, cardSource, output: path.join(blogSource, 'public') }), /inside a source/);
    const unrelated = path.join(temp, 'unrelated');
    fs.mkdirSync(unrelated);
    assert.throws(() => assemble({ blogSource, cardSource, output: unrelated }), /unmarked/);
    assert.equal(fs.readFileSync(path.join(blogSource, 'index.html'), 'utf8'), sample, 'source blog is unchanged');
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});
