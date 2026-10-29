'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {inspectMarkdown} = require('./candidate.cjs');

function inspect(source) {
  return inspectMarkdown('README.md', source, __dirname);
}

test('rejects malformed local URL escapes before parser normalization', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-escape-test-'));
  const file = path.join(root, 'exists%ZZ.md');
  try {
    fs.writeFileSync(file, 'fixture');
    for (const source of ['[x](exists%ZZ.md)', '![x](exists%ZZ.md)', '[x][id]\n\n[id]: exists%ZZ.md']) {
      assert.match(inspectMarkdown('README.md', source, root).join('\n'), /invalid URL encoding/);
    }
    assert.deepEqual(inspectMarkdown('README.md', '[x](exists%25ZZ.md)', root), []);
    assert.deepEqual(inspectMarkdown('README.md', '[x](exists%25ZZ.md?key=%ZZ)', root), []);
  } finally { fs.unlinkSync(file); fs.rmdirSync(root); }
});

test('preserves unclosed-fence diagnostics across quote-depth changes', () => {
  assert.deepEqual(inspect('> - ~~~\n>   code\n> > - [bad](absent.md)'), [
    'README.md:1: unclosed ~~~ code fence', 'README.md:3: missing local link: absent.md',
  ]);
  assert.deepEqual(inspect('> > - ~~~\n> >   code\n> - [bad](absent.md)'), [
    'README.md:1: unclosed ~~~ code fence', 'README.md:3: missing local link: absent.md',
  ]);
  assert.deepEqual(inspect('> - ~~~\n>   code\n>   ~~~\n> > - [bad](absent.md)'), [
    'README.md:4: missing local link: absent.md',
  ]);
});

test('reports explicit missing references while leaving escaped and code text inert', () => {
  assert.match(inspect('[missing][ref]').join('\n'), /missing reference definition: ref/);
  assert.deepEqual(inspect('\\[missing][ref] and `[missing][ref]`'), []);
});

test('checks every reference definition even when labels repeat', () => {
  const issues = inspect('[ref]: package.json\n\n[ref]: absent.md\n\n[ref]');
  assert(issues.some(issue => issue.includes('missing local link: absent.md')));
});

test('fence closure must be a standalone marker', () => {
  assert.match(inspect('~~~\nnot a closer ~~~').join('\n'), /unclosed ~~~/);
  assert.deepEqual(inspect('~~~\nbody\n~~~'), []);
});

test('an unclosed list fence is still reported when a sibling item follows', () => {
  for (const source of ['- ~~~\n  code\n- [bad](absent.md)', '1. ~~~\n   code\n2. [bad](absent.md)']) {
    assert.deepEqual(inspect(source), ['README.md:1: unclosed ~~~ code fence']);
  }
});

test('an unclosed quoted list fence keeps sibling links hidden', () => {
  for (const source of [
    '> - ~~~\n>   code\n> - [hidden](absent.md)',
    '> 1. ~~~\n>    code\n> 2. [hidden](absent.md)',
    '> > - ~~~\n> >   code\n> > - [hidden](absent.md)',
  ]) assert.deepEqual(inspect(source), ['README.md:1: unclosed ~~~ code fence']);
});

test('quoted list-fence visibility stops at a closer or outside the list', () => {
  for (const source of [
    '> - ~~~\n>   code\n> - [hidden](absent.md)\n> [shown](absent.md)',
    '> - ~~~\n>   code\n> - ~~~\n> [shown](absent.md)',
    '> - ~~~\n>   code\n>   ~~~\n> - [shown](absent.md)',
  ]) assert.deepEqual(inspect(source), ['README.md:4: missing local link: absent.md']);
  assert.deepEqual(inspect('> - ~~~\n>   code\n[outside](absent.md)'),
    ['README.md:3: missing local link: absent.md']);
});

test('list-fence visibility stops at a closing marker or outside the list', () => {
  assert.deepEqual(inspect('- ~~~\n  code\n- [hidden](absent.md)\n[out](absent.md)'),
    ['README.md:4: missing local link: absent.md']);
  assert.deepEqual(inspect('- ~~~\n  code\n- ~~~\n[out](absent.md)'),
    ['README.md:4: missing local link: absent.md']);
  assert.deepEqual(inspect('- ~~~\n  code\n  ~~~\n- [shown](absent.md)'),
    ['README.md:4: missing local link: absent.md']);
});

test('comment tails retain valid references and report broken targets', () => {
  assert.deepEqual(inspect('<!-- note --> [good][ref]\n\n[ref]: package.json'), []);
  const issues = inspect('<!-- note --> [bad][ref]\n\n[ref]: absent.md');
  assert(issues.some(issue => issue.includes('missing local link: absent.md')));
  assert(!issues.some(issue => issue.includes('missing reference definition')));
});

test('reports the actual line of a multiline paragraph link', () => {
  assert.deepEqual(inspect('first line\n[bad](absent.md)'), ['README.md:2: missing local link: absent.md']);
});
