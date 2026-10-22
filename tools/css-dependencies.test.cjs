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
