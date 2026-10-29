'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const markdownIt = require('markdown-it')({html: true});
const commonmark = require('commonmark');
const parse5 = require('parse5');
const commonParser = new commonmark.Parser();
const commonRenderer = new commonmark.HtmlRenderer();

function links(html) {
  const result = [];
  function visit(node) {
    const name = node.tagName === 'a' ? 'href' : node.tagName === 'img' ? 'src' : null;
    if (name) result.push(node.attrs.find(attribute => attribute.name === name).value);
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse5.parseFragment(html));
  return result;
}

const cases = [
  ['inline', '[x](one.md)', ['one.md']],
  ['image', '![icon](one.svg)', ['one.svg']],
  ['forward reference', '[x][id]\n\n[id]: one.md', ['one.md']],
  ['code', '`[hidden](no.md)` [x](one.md)', ['one.md']],
  ['list', '- [x](one.md)\n- ![y](two.svg)', ['one.md', 'two.svg']],
  ['comments', '<!-- [hidden](no.md) -->\n\n[x](one.md)', ['one.md']],
  ['comment tail', '<!-- `-->` [hidden](no.md)', []],
  ['angle destination', '[x](<a b.md>)', ['a%20b.md']],
];
for (const [name, source, expected] of cases) {
  test(`rendered targets agree with an independent CommonMark renderer: ${name}`, () => {
    assert.deepEqual(links(markdownIt.render(source)), expected);
    assert.deepEqual(links(commonRenderer.render(commonParser.parse(source))), expected);
  });
}
