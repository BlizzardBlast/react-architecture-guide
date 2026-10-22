const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectMarkdown, checkAll } = require('./validate-docs.cjs');

function fixture(markdown, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-docs-'));
  try {
    fs.writeFileSync(path.join(dir, 'README.md'), markdown);
    return callback(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('valid fenced text with a fictitious link remains ignored', () => fixture(
  '~~~ts\n[not real](missing.md)\n~~~\n', root => {
    assert.deepEqual(checkAll(root).issues, []);
  },
));
test('mismatched fence chars are rejected even with even fence count', () => fixture(
  '~~~ts\n[not real](missing.md)\n' + '```\n',
  root => assert.match(checkAll(root).issues.join(' '), /unclosed ~~~/),
));
test('a closing fence must be at least as long as the opener', () => fixture(
  '~~~~ts\n~~~\n', root => assert.match(checkAll(root).issues.join(' '), /unclosed ~~~~/),
));
test('missing Markdown links outside fences are reported', () => fixture(
  '# Title\n[missing](nothing.md)\n', root => {
    assert.match(inspectMarkdown('README.md', fs.readFileSync(path.join(root, 'README.md'), 'utf8'), root).join(' '), /missing local link/);
  },
));
test('valid local links and anchors pass', () => fixture(
  '# Title\n[Self](README.md#title)\n', root => assert.deepEqual(checkAll(root).issues, []),
));
test('attempts to link outside the repository are rejected', () => fixture(
  '# Title\n[escape](../outside.md)\n', root => assert.match(checkAll(root).issues.join(' '), /outside-repository/),
));

test('local links with balanced filename parentheses pass', () => fixture(
  '[Release](release(v2).md)', root => {
    fs.writeFileSync(path.join(root, 'release(v2).md'), '# Release');
    assert.deepEqual(checkAll(root).issues, []);
  },
));
test('angle-bracket destinations may contain spaces', () => fixture(
  '[Guide](<My Guide.md>)', root => {
    fs.writeFileSync(path.join(root, 'My Guide.md'), '# Guide');
    assert.deepEqual(checkAll(root).issues, []);
  },
));
test('references to missing local files fail even for reference-style links', () => fixture(
  '[Guide][ref]\n[ref]: docs/missing.md\n', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('forward reference links are accepted when the target exists', () => fixture(
  '[Guide][ref]\n[ref]: guide.md\n', root => {
    fs.writeFileSync(path.join(root, 'guide.md'), '# Guide');
    assert.deepEqual(checkAll(root).issues, []);
  },
));
test('local image links are validated just like text links', () => fixture(
  '![Icon](missing.svg)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('unresolved reference labels are reported', () => fixture(
  '[Guide][does-not-exist]', root =>
    assert.match(checkAll(root).issues.join(' '), /missing reference definition/),
));

test('single-line HTML comments do not create dependencies', () => fixture(
  '<!-- [hidden](missing.md) -->', root => assert.deepEqual(checkAll(root).issues, []),
));
test('multiline HTML comments do not create links or definitions', () => fixture(
  '<!--\n[hidden][ref]\n[ref]: missing.md\n-->\n', root =>
    assert.deepEqual(checkAll(root).issues, []),
));
test('links outside a closed HTML comment remain checked', () => fixture(
  '<!-- [ignored](missing.md) -->\n[visible](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('indented code blocks do not create missing links', () => fixture(
  '\n    [ignored](missing.md)\n\n[Self](README.md)\n', root =>
    assert.deepEqual(checkAll(root).issues, []),
));
test('indented paragraph continuation is still checked for links', () => fixture(
  'A paragraph\n    [visible](missing.md)\n', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('HTML-like syntax in a fence cannot suppress later links', () => fixture(
  '~~~md\n<!--\n~~~\n[visible](missing.md)\n', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
