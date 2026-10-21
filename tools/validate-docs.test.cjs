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
