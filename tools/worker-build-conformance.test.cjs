'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { check } = require('./check-boundaries.cjs');

const viteCli = path.resolve(__dirname, '../examples/react-app/node_modules/vite/bin/vite.js');
function buildWorkerFixture(mainPath, source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-worker-conformance-'));
  const write = (name, value) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  try {
    write('package.json', JSON.stringify({ private: true, type: 'module' }));
    write('index.html', '<!doctype html><script type="module" src="/src/' + mainPath + '"></script>');
    write('src/' + mainPath, source);
    write('src/modules/orders/ui/worker.js', 'self.onmessage = () => self.postMessage("ready");');
    const checked = check(path.join(root, 'src'));
    assert.ok(fs.existsSync(viteCli), 'Install the React example dependencies before running the Vite conformance suite');
    const outDir = path.join(root, 'output');
    const build = spawnSync(process.execPath,
      [viteCli, 'build', root, '--outDir', outDir, '--emptyOutDir'],
      { cwd: root, encoding: 'utf8', timeout: 30_000 });
    assert.equal(build.status, 0, build.error?.message || build.stderr + build.stdout);
    const assets = fs.readdirSync(path.join(outDir, 'assets'));
    assert.ok(assets.some(name => /^worker-[\w-]+\.js$/.test(name)),
      'The real Vite build must emit a separate Worker chunk: ' + assets.join(', '));
    return checked;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('real Vite Worker bundles agree with accepted and rejected architecture ownership', () => {
  const owned = buildWorkerFixture('modules/orders/ui/main.js',
    'export const background = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });');
  assert.deepEqual(owned.errors, []);

  const foreign = buildWorkerFixture('shared/ui/main.js',
    'export const background = new Worker(new URL("../../modules/orders/ui/worker.js", import.meta.url), { type: "module" });');
  assert.match(foreign.errors.join(' '), /shared-must-be-independent/);
});
