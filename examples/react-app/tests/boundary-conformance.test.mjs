import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { check } from '../../../tools/check-boundaries.cjs';

async function assertConformance(entries, aliases, expectedPrivate, name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'react-vite-boundary-'));
  try {
    const absoluteAliases = Object.fromEntries(Object.entries(aliases)
      .map(([find, target]) => [find, path.resolve(root, target)]));
    const files = {
      'package.json': '{"type":"module"}',
      'vite.config.ts': 'export default { resolve: { alias: ' + JSON.stringify(absoluteAliases) + ' } };',
      'architecture.config.json': JSON.stringify({ viteAliases: aliases }),
      'src/shared/ui/check.ts': 'export const checked = true;',
      ...entries,
    };
    for (const [relative, contents] of Object.entries(files)) {
      const file = path.resolve(root, relative);
      assert(file.startsWith(root + path.sep), 'fixture must stay inside its temporary project');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }
    const checked = check(path.join(root, 'src'));
    let built;
    try {
      built = await build({ root, configFile: false, resolve: { alias: absoluteAliases },
        logLevel: 'silent', build: { write: false, assetsInlineLimit: 0 } });
    } catch (error) {
      assert(checked.errors.length > 0, name + ': unresolved Vite imports must fail the checker');
      throw error;
    }
    const privateEmitted = built.output.some(item =>
      String(item.type === 'asset' ? item.source : item.code).includes('PRIVATE_TARGET'));
    assert.equal(privateEmitted, expectedPrivate, name + ': Vite target');
    if (expectedPrivate) assert.match(checked.errors.join(' '), /shared-must-be-independent|deep-module-import/, name);
    else assert.deepEqual(checked.errors, [], name);
  } finally {
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('source asset alias ownership agrees with Vite build output', async () => {
  for (const [name, find, request, url, expectedPrivate] of [
    ['relative import', './icon.svg', './icon.svg', false, true],
    ['root import', '/src/shared/ui/icon.svg', '/src/shared/ui/icon.svg', false, true],
    ['root URL', '/src/shared/ui/icon.svg', '/src/shared/ui/icon.svg', true, true],
    ['dot-relative URL', './icon.svg', './icon.svg', true, false],
    ['exact alias with query', './icon.svg', './icon.svg?raw', false, false],
    ['prefix alias with query', './assets', './assets/icon.svg?raw', false, true],
  ]) {
    const replacement = find === './assets' ? 'src/modules/orders/ui' : 'src/modules/orders/ui/private.svg';
    await assertConformance({
      'index.html': '<script type="module" src="/src/app/main.ts"></script>',
      'src/app/main.ts': 'import { asset } from "../shared/ui/view"; console.log(asset);',
      'src/shared/ui/view.ts': url
        ? 'export const asset = new URL(' + JSON.stringify(request) + ', import.meta.url).href;'
        : 'import asset from ' + JSON.stringify(request) + '; export { asset };',
      'src/shared/ui/icon.svg': '<svg>SAFE_DECOY</svg>',
      'src/shared/ui/assets/icon.svg': '<svg>SAFE_DECOY</svg>',
      'src/modules/orders/ui/private.svg': '<svg>PRIVATE_TARGET</svg>',
      'src/modules/orders/ui/icon.svg': '<svg>PRIVATE_TARGET</svg>',
    }, { [find]: replacement }, expectedPrivate, name);
  }
  await assert.rejects(assertConformance({
    'index.html': '<script type="module" src="/src/app/main.ts"></script>',
    'src/app/main.ts': 'import text from "helpers?raw"; console.log(text);',
    'src/shared/ui/helper.ts': 'export const helper = true;',
  }, { helpers: 'src/shared/ui/helper.ts' }, false, 'unmatched bare query alias'),
  /failed to resolve import "helpers\?raw"/i);
});

test('HTML alias dispatch agrees with Vite build output', async () => {
  for (const [name, ext, markup, expectedPrivate, encoded = false] of [
    ['module script', 'ts', '<script type="module" src="URL"></script>', true],
    ['encoded module script', 'ts', '<script type="module" src="URL"></script>', true, true],
    ['stylesheet', 'css', '<link rel="stylesheet" href="URL">', true],
    ['encoded CSS link', 'css', '<link rel="stylesheet" href="URL">', true, true],
    ['CSS preload', 'css', '<link rel="preload" as="style" href="URL">', true],
    ['CSS icon', 'css', '<link rel="icon" href="URL">', true],
    ['CSS canonical', 'css', '<link rel="canonical" href="URL">', true],
    ['media CSS', 'css', '<link rel="stylesheet" media="all" href="URL">', false],
    ['disabled CSS', 'css', '<link rel="stylesheet" disabled href="URL">', false],
    ['uppercase CSS', 'CSS', '<link rel="stylesheet" href="URL">', false],
    ['ignored CSS', 'css', '<link rel="stylesheet" vite-ignore href="URL">', false],
    ['ignored script', 'ts', '<script type="module" vite-ignore src="URL"></script>', false],
    ['JS preload', 'ts', '<link rel="preload" as="script" href="URL">', false],
    ['module preload', 'ts', '<link rel="modulepreload" href="URL">', false],
    ['image', 'svg', '<img src="URL" alt="">', false],
  ]) {
    const url = '/src/shared/ui/entry.' + ext;
    const reference = encoded ? url.replace('entry.', '%65ntry.') : url;
    const find = encoded && ext === 'ts' ? reference : url;
    const contents = marker => ext === 'ts' ? 'console.log("' + marker + '");'
      : ext.toLowerCase() === 'css' ? '.' + marker + '{color:red}' : '<svg>' + marker + '</svg>';
    await assertConformance({
      'index.html': markup.replace('URL', reference),
      ['src/shared/ui/entry.' + ext]: contents('SAFE_DECOY'),
      ['src/modules/orders/ui/private.' + ext]: contents('PRIVATE_TARGET'),
    }, { [find]: 'src/modules/orders/ui/private.' + ext }, expectedPrivate, name);
  }
  await assertConformance({
    'index.html': '<img src="/src/modules/orders/ui/entry.png" alt="">',
    'public/src/modules/orders/ui/entry.png': 'SAFE_PUBLIC_IMAGE',
    'src/modules/orders/ui/entry.png': 'PRIVATE_TARGET',
    'src/shared/ui/other.png': 'SAFE_ALIAS_IMAGE',
  }, { '/src/modules/orders/ui/entry.png': 'src/shared/ui/other.png' }, false, 'public file precedence');
});
