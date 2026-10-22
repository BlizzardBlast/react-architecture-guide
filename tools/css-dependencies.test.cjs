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
