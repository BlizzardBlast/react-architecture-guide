'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveViteLocalModule } = require('./vite-runtime-resolution.cjs');
function fixture(files, assertion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-runtime-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    }
    assertion(name => {
      const found = resolveViteLocalModule(path.join(root, name));
      return found ? path.relative(root, found).split(path.sep).join('/') : null;
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test('actual JS wins over TS in explicit and extensionless imports', () =>
  fixture({ 'b.js': '', 'b.ts': '' }, resolve => {
    assert.equal(resolve('b.js'), 'b.js');
    assert.equal(resolve('b'), 'b.js');
  }));
test('missing JS fallbacks resolve TS sources', () =>
  fixture({ 'b.ts': '', 'c.mts': '', 'd.cts': '' }, resolve => {
    assert.equal(resolve('b.js'), 'b.ts');
    assert.equal(resolve('c.mjs'), 'c.mts');
    assert.equal(resolve('d.cjs'), 'd.cts');
  }));
test('existing MJS/JSX win over MTS/TSX', () =>
  fixture({ 'b.mjs': '', 'b.mts': '', 'c.jsx': '', 'c.tsx': '' }, resolve => {
    assert.equal(resolve('b.mjs'), 'b.mjs');
    assert.equal(resolve('c.jsx'), 'c.jsx');
  }));
test('extension order and directory index follow Vite', () =>
  fixture({ 'b.mjs': '', 'b.js': '', 'dir/index.js': '', 'dir/index.ts': '' }, resolve => {
    assert.equal(resolve('b'), 'b.mjs');
    assert.equal(resolve('dir'), 'dir/index.js');
  }));
test('missing source and package-directory entries fail closed', () =>
  fixture({ 'pkg/package.json': '{"main":"entry.js"}', 'pkg/index.ts': '' }, resolve => {
    assert.equal(resolve('pkg'), null);
    assert.equal(resolve('missing'), null);
  }));
