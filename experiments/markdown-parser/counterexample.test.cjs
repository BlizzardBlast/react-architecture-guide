'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const markdownIt = require('markdown-it')({html: true});
const commonmark = require('commonmark');
const parse5 = require('parse5');
const production = require('./production-validator.cjs');
const candidate = require('./candidate.cjs');

function links(html) {
  const found = [];
  function visit(node) {
    if (node.tagName === 'a') found.push(node.attrs.find(attr => attr.name === 'href').value);
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse5.parseFragment(html));
  return found;
}

test('mixed list fences expose the candidate false negative', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-counterexample-'));
  try {
    const source = '1. ~~~\n   code\n- ~~~\n[bad](missing.md)';
    const rendered = new commonmark.HtmlRenderer().render(new commonmark.Parser().parse(source));
    assert.deepEqual(links(markdownIt.render(source)), ['missing.md']);
    assert.deepEqual(links(rendered), ['missing.md']);
    assert.deepEqual(production.inspectMarkdown('README.md', source, root),
      ['README.md:4: missing local link: missing.md']);
    assert.deepEqual(candidate.inspectMarkdown('README.md', source, root),
      ['README.md:3: unclosed ~~~ code fence']);
    for (const validator of [production, candidate]) {
      assert.deepEqual(validator.inspectMarkdown('README.md', '[bad](missing.md)', root),
        ['README.md:1: missing local link: missing.md']);
    }
  } finally {
    fs.rmSync(root, {recursive: true});
  }
});
