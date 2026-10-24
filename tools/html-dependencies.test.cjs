const test = require('node:test');
const assert = require('node:assert/strict');
const { scanHtml } = require('./html-dependencies.cjs');

const main = '<script type="module" src="/src/main.tsx"></script>';

test('HTML5 raw text and RCDATA do not allow fake comments to hide active elements', () => {
  for (const html of [
    '<title><!--</title><style>@import url("/src/private.css");</style>-->' + main,
    '<textarea><!--</textarea><script type="module" src="/outside/private.ts"></script>-->' + main,
    '<title><!--</title><button onclick="import(\'/private.ts\')">Go</button>-->' + main,
  ]) {
    const result = scanHtml(html);
    assert.ok(result.errors.length || result.references.some(r => r.spec === '/outside/private.ts'));
  }
});

test('HTML5 parser preserves quoted greater-than in safe script attributes', () => {
  for (const html of [
    '<script data-info="a > b" type="module" src="/src/main.tsx"></script>',
    "<script type='module' src='/src/main.tsx' data-note='1 > 0'></script>",
  ]) {
    assert.deepEqual(scanHtml(html), {
      errors: [], references: [{ spec: '/src/main.tsx', kind: 'script' }],
    });
  }
});

test('ordinary assets and responsive srcset expose every dependency', () => {
  const html = '<img src="/src/shared/ui/a.svg" srcset="/src/shared/ui/a.svg 1x, /src/shared/ui/b.svg 2x">' +
    '<link rel="stylesheet" href="/src/app/theme.css">' + main;
  const result = scanHtml(html);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.references.map(x => x.spec), [
    '/src/shared/ui/a.svg', '/src/shared/ui/a.svg', '/src/shared/ui/b.svg',
    '/src/app/theme.css', '/src/main.tsx',
  ]);
});

test('executable HTML and inline styling fail closed', () => {
  for (const html of [
    '<button onclick="import(\'/private.ts\')">Go</button>',
    '<img onerror="import(\'/private.ts\')">',
    '<div style="background:url(/private.png)"></div>',
    '<style>@import "/src/private.css";</style>',
    '<a href="java&#x73;cript:alert(1)">Click</a>',
    '<script type="importmap">{"imports":{"x":"/src/private.ts"}}</script>',
    '<iframe src="/hidden.html"></iframe>',
    '<object data="/hidden.html"></object>',
    '<embed src="/hidden.html">',
    '<base href="https://elsewhere.example">',
    '<meta http-equiv="refresh" content="0;url=/hidden.html">',
    '<noscript><img src="/private.png"></noscript>',
    '<link rel="preload" as="script" href="https://example.org/evil.js">',
  ]) {
    assert.ok(scanHtml(html).errors.length, 'must reject: ' + html);
  }
});

test('inert JSON and actual HTML comments cannot generate source dependencies', () => {
  const text = '<script type="application/json">{"text":"<script>"}' +
    '</script><!-- <script type="module" src="/hidden.ts"></script> -->' + main;
  assert.deepEqual(scanHtml(text), {
    errors: [], references: [{ spec: '/src/main.tsx', kind: 'script' }],
  });
});

test('HTML resource lists refuse unsupported srcset candidate syntax', () => {
  for (const html of [
    '<img srcset="data:image/png;base64,aabb">',
    '<source srcset="/src/a.png 1x 2x">',
  ]) assert.match(scanHtml(html).errors.join(' '), /unsupported-vite-html-srcset/);
});

test('template contents are checked because JavaScript can instantiate them', () => {
  assert.match(scanHtml('<template><button onclick="alert(1)">Go</button></template>').errors.join(' '),
    /executable event handler/);
});

test('Vite link imagesrcset candidates are collected independently of href', () => {
  const result = scanHtml('<link rel="preload" as="image" href="/src/shared/a.png" ' +
    'imagesrcset="/src/shared/b.png 1x, /src/modules/orders/ui/private.svg 2x">');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.references.map(x => x.spec), [
    '/src/shared/b.png', '/src/modules/orders/ui/private.svg', '/src/shared/a.png',
  ]);
});

test('Vite-recognized meta images and media become owned source references', () => {
  for (const attrs of [
    'name="twitter:image"', 'name="msapplication-tileimage"',
    'name="msapplication-config"', 'property="og:image"',
    'property="og:image:url"', 'property="og:image:secure_url"',
    'property="og:audio"', 'property="og:video:secure_url"',
  ]) {
    assert.deepEqual(scanHtml('<meta ' + attrs + ' content="/src/modules/orders/ui/private.svg">'), {
      errors: [], references: [{
        spec: '/src/modules/orders/ui/private.svg', kind: 'asset',
      }],
    }, attrs);
  }
});

test('descriptive meta values stay inert while unsupported image candidates fail closed', () => {
  assert.deepEqual(scanHtml('<meta name="description" content="A > B">' +
    '<meta property="og:title" content="Home">'), { errors: [], references: [] });
  assert.match(scanHtml('<link rel="preload" as="image" href="/src/a.png" ' +
    'imagesrcset="/src/a.png 1x 2x">').errors.join(' '), /unsupported-vite-html-srcset/);
});
