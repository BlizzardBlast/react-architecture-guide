'use strict';
const assert = require('node:assert/strict');
const md = require('markdown-it')({html: true});
const parse5 = require('parse5');
const cases = [
  ['inline', '[visible](one.md)', ['one.md']],
  ['image', '![icon](icon.svg)', ['icon.svg']],
  ['reference', '[id]: guide.md\n\n[visible][id]', ['guide.md']],
  ['forward reference', '[visible][id]\n\n[id]: guide.md', ['guide.md']],
  ['code', '`[hidden](missing.md)` [visible](one.md)', ['one.md']],
  ['comment block', '<!-- [hidden](missing.md) -->\n\n[visible](one.md)', ['one.md']],
  ['list', '- [visible](one.md)\n- ![icon](icon.svg)', ['one.md', 'icon.svg']],
  ['table', '| Name | Link |\n| --- | --- |\n| one | [visible](one.md) |', ['one.md']],
  ['same-line block comment tail', '<!-- `-->` [Broken](missing.md)', []],
];
function renderedLinks(source) {
  const fragment = parse5.parseFragment(md.render(source));
  const links = [];
  function visit(node) {
    if (node.tagName === 'a' || node.tagName === 'img') {
      const name = node.tagName === 'a' ? 'href' : 'src';
      const attr = node.attrs.find(attribute => attribute.name === name);
      if (attr) links.push(attr.value);
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(fragment); return links;
}
function tokenLinks(source) {
  const links = [];
  for (const token of md.parse(source, {})) for (const child of token.children || []) {
    if (child.type === 'link_open') links.push(child.attrGet('href'));
    if (child.type === 'image') links.push(child.attrGet('src'));
  }
  return links;
}
for (const [name, source, expected] of cases) {
  const rendered = renderedLinks(source);
  const tokens = tokenLinks(source);
  assert.deepEqual(rendered, expected, `${name}: rendered`);
  assert.deepEqual(tokens, rendered, `${name}: tokens vs rendered`);
  console.log(`PASS ${name}: ${JSON.stringify(rendered)}`);
}
