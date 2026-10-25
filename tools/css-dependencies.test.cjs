'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scanCssDependencies: scan } = require('./css-dependencies.cjs');

test('extracts stylesheet and asset references', () => {
  assert.deepEqual(scan('@import "./base.css"; @import url("@theme/colors.css"); .a{background:url(../icon.svg)}'), {
    references: [
      { spec: './base.css', kind: 'import' },
      { spec: '@theme/colors.css', kind: 'import' },
      { spec: '../icon.svg', kind: 'url' },
    ], errors: [],
  });
});
test('does not interpret comments or strings as directives', () => {
  assert.deepEqual(scan('/* @import "../../private.css" */ .a:before { content: "@import private"; }'),
    { references: [], errors: [] });
});
test('supports Sass use and forward', () => {
  assert.deepEqual(scan('@use "@theme/base.scss"; @forward "../tokens.scss";').references, [
    { spec: '@theme/base.scss', kind: 'use' }, { spec: '../tokens.scss', kind: 'forward' },
  ]);
});
test('rejects unresolved/dynamic CSS dependencies', () => {
  for (const css of ['@import url(var(--dynamic));', '@use base;', 'a{background:url(var(--image))}']) {
    assert.ok(scan(css).errors.length, css);
  }
});
test('retains data and fragment URLs for safe filtering by checker', () => {
  assert.deepEqual(scan('.a{background:url(data:image/svg+xml;base64,abc)} .b{filter:url(#filter)}').references.map(x => x.spec),
    ['data:image/svg+xml;base64,abc', '#filter']);
});

test('CSS at-rules are case-insensitive', () => {
  assert.deepEqual(scan('@IMPORT "../styles.css";').references, [
    { spec: '../styles.css', kind: 'import' },
  ]);
});

test('multiple Sass imports and computed load-css fail closed', () => {
  assert.ok(scan('@import "./safe.css", "../../modules/orders/ui/private.css";').errors.length);
  assert.ok(scan('@include meta.load-css("../../modules/orders/ui/private.css");').errors.length);
});

test('Less and SCSS line comments are masked without altering URL schemes', () => {
  for (const extension of ['less', 'scss', 'sass']) {
    const text = '// @import "../../modules/orders/ui/private.less";\n' +
      '.widget { background: url(https://cdn.example.com/a.svg); }\n' +
      '// .widget { background: url("../../modules/orders/ui/private.svg"); }';
    assert.deepEqual(scan(text, { filename: 'theme.' + extension }).references, [
      { spec: 'https://cdn.example.com/a.svg', kind: 'url' },
    ]);
  }
});

test('Less import option lists resolve their literal dependency', () => {
  const imports = scan('@import (reference, optional) "./tokens.less"; ' +
    '@import (inline) "./base.css";', { filename: 'theme.less' });
  assert.deepEqual(imports.errors, []);
  assert.deepEqual(imports.references, [
    { spec: './tokens.less', kind: 'import', optional: true },
    { spec: './base.css', kind: 'import' },
  ]);
});

test('invalid, non-Less, and computed import options fail closed', () => {
  assert.ok(scan('@import (unrecognized) "./x.less";', { filename: 'x.less' }).errors.length);
  assert.ok(scan('@import (reference) "./x.css";', { filename: 'x.css' }).errors.length);
  assert.ok(scan('@import (reference "./x.less";', { filename: 'x.less' }).errors.length);
});

test('CSS image-set quoted alternatives and url() targets are visible to ownership checks', () => {
  const result = scan('.x { background: image-set("../a.svg" 1x, url("../b.svg") 2x); }');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.references.map(x => x.spec).sort(), ['../a.svg', '../b.svg']);
});

test('dynamic and unterminated image-set choices fail closed', () => {
  assert.ok(scan('.x { background: image-set(var(--asset) 1x); }').errors.length);
  assert.ok(scan('.x { background: image-set("../a.svg" 1x; }').errors.length);
});

test('an optional Less import retains the optional flag for resolution', () => {
  assert.deepEqual(scan('@import (optional) "./missing.less";', { filename: 'x.less' }).references,
    [{ spec: './missing.less', kind: 'import', optional: true }]);
});

test('image-set parses escaped quotes and backslashes without truncation', () => {
  const r = scan(String.raw`.x { background: image-set("a\"b.svg" 1x, "folder\\icon.svg" 2x); }`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.references.map(x => x.spec), ['a"b.svg', 'folder\\icon.svg']);
});
test('image-set resolves CSS hex escape sequences before checking asset paths', () => {
  const r = scan(String.raw`.x { background: image-set("icons/a\2e svg" 1x); }`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.references.map(x => x.spec), ['icons/a.svg']);
});
test('unterminated quoted image-set choices are not silently accepted', () => {
  assert.ok(scan('.x{background:image-set("no-end 1x)}').errors.length);
});

test('CSS escaped dependency identifiers fail closed and quoted text remains inert', () => {
  for (const css of ["@im\\70ort \"../../modules/orders/ui/private.css\";",".widget { background: u\\72l(\"../../modules/orders/ui/private.svg\"); }",".widget { background: \\75rl(\"../../modules/orders/ui/private.svg\"); }","@i\\6d port \"../../modules/orders/ui/private.css\";"]) {
    assert.match(scan(css).errors.join(' '), /unsupported-css-escaped-identifier/, css);
  }
  assert.deepEqual(scan(".x { content: \"@im\\70ort u\\72l(\"; }").errors, []);
  assert.deepEqual(scan('@import "./safe.css"; .x{background:url("./safe.svg")}').errors, []);
});


test('only complete CSS function identifiers create dependency edges', () => {
  const custom = [
    'my-url("../private.svg")',
    'image-url("../private.svg")',
    '漢url("../private.svg")',
    'my-image-set("../private.svg" 1x)',
    'my-webkit-image-set("../private.svg" 1x)',
  ];
  for (const expression of custom) {
    const result = scan('.sample { --illustration: ' + expression + '; }');
    assert.deepEqual(result, { references: [], errors: [] }, expression);
  }
  const valid = scan('.sample { background: url("./safe.svg");' +
    'background-image: image-set("./a.svg" 1x, "./b.svg" 2x);' +
    'mask-image: -webkit-image-set("./c.svg" 1x); }');
  assert.deepEqual(valid.errors, []);
  assert.deepEqual(valid.references.map(x => x.spec),
    ['./safe.svg', './a.svg', './b.svg', './c.svg']);
});

test('Sass load-css and at-rule names require complete identifiers', () => {
  assert.deepEqual(scan('@include app-load-css("../private.css");' +
    '@import-fancy "../private.css";', { filename: 'theme.scss' }),
    { references: [], errors: [] });
  assert.match(scan('@include meta.load-css("../private.css");',
    { filename: 'theme.scss' }).errors.join(' '),
    /computed Sass load-css/);
  assert.deepEqual(scan('@import "./safe.css"; @use "./tokens.scss";',
    { filename: 'theme.scss' }).references.map(x => x.spec),
    ['./safe.css', './tokens.scss']);
});

test('Less @plugin fails closed with literal and computed options', () => {
  for (const source of [
    '@plugin "../../modules/orders/infrastructure/private.js";',
    '@plugin (mode="unsafe") "./private.js";',
    '@PLUGIN @computed;',
  ]) assert.match(scan(source, { filename: 'style.less' }).errors.join(' '),
    /unsupported-less-plugin/, source);
});
test('Less comments and strings containing @plugin remain inert', () => {
  const source = '/* @plugin "ignored.js"; */\n' +
    '// @plugin "ignored.js";\n' +
    '.x::before { content: "@plugin ignored.js"; }';
  assert.deepEqual(scan(source, { filename: 'style.less' }),
    { references: [], errors: [] });
});

test('unquoted local and remote URL paths containing @plugin are assets, not Less plugins', () => {
  const input = '.card { background: url(./icons/@plugin.svg);' +
    ' border-image: url(https://cdn.example.test/@plugin/image.png); }';
  const result = scan(input, { filename: 'card.less' });
  assert.deepEqual(result, {
    references: [
      { spec: './icons/@plugin.svg', kind: 'url' },
      { spec: 'https://cdn.example.test/@plugin/image.png', kind: 'url' },
    ],
    errors: [],
  });
});

test('only real Less plugin at-rules are blocked, even after other statements', () => {
  for (const source of [
    '@plugin "./unsafe.js";',
    '@import "./base.less";\n @plugin (mode="x") "./unsafe.js";',
    '.container { color: red; @PLUGIN "./unsafe.js"; }',
    '// ignored comment\n@plugin @computed;',
  ]) {
    assert.match(scan(source, { filename: 'card.less' }).errors.join(' '),
      /unsupported-less-plugin/, source);
  }
});

test('Less variable names and function/data URL contents do not impersonate plugin directives', () => {
  const source = '@plugin: "just a variable";\n' +
    '.card { content: "@plugin \\"not-executable\\"";' +
    ' background: url(data:image/svg+xml;utf8,@plugin);' +
    ' mask-image: image-set(url(./icons/@plugin.png) 1x); }';
  const result = scan(source, { filename: 'card.less' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.references.map(ref => ref.spec), [
    'data:image/svg+xml;utf8,@plugin', './icons/@plugin.png',
  ]);
});

test('longer Less identifiers are not treated as executable @plugin at-rules', () => {
  const result = scan('@plugin-theme: red; @plugin-other: blue;', { filename: 'x.less' });
  assert.deepEqual(result, { references: [], errors: [] });
});
