const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { check } = require('./check-boundaries.cjs');

function setup(entries) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'react-arch-'));
  for (const [name, contents] of Object.entries(entries)) {
    const file = path.join(home, 'src', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return { root: path.join(home, 'src'), cleanup: () => fs.rmSync(home, { force: true, recursive: true }) };
}
function withFixture(entries, fn) {
  const f = setup(entries);
  try { return fn(check(f.root)); } finally { f.cleanup(); }
}
const base = {
  'shared/ui/button.ts': 'export const button = 1;',
  'modules/orders/domain/order.ts': 'export type Order = { id: string };',
  'modules/orders/application/place.ts': 'import type { Order } from "../domain/order"; export type Writer = (order: Order) => Promise<void>;',
  'modules/orders/infrastructure/writer.ts': 'import type { Writer } from "../application/place"; export const writer: Writer = async () => {};',
  'modules/orders/ui/form.ts': 'import type { Order } from "../domain/order"; export const form = (o: Order) => o.id;',
  'modules/orders/index.ts': 'export { form } from "./ui/form";',
  'routes/orders.ts': 'import { form } from "../modules/orders"; export const page = form;',
};

test('valid layered dependency flow and public API pass', () => withFixture(base, result => {
  assert.deepEqual(result.errors, []);
}));
test('reject shared importing a domain type', () => withFixture({ ...base, 'shared/ui/button.ts': 'import type { Order } from "../../modules/orders/domain/order"; export const f = (v: Order) => v.id;' }, result => {
  assert.match(result.errors.join(' '), /shared-must-be-independent/);
}));
test('reject direct cross-module import', () => withFixture({ ...base, 'modules/payments/application/pay.ts': 'import type { Order } from "../../orders/domain/order"; export type P = Order;' }, result => {
  assert.match(result.errors.join(' '), /sibling-module-dependency/);
}));
test('reject deep route imports and UI-to-infrastructure dependency', () => withFixture({ ...base, 'routes/orders.ts': 'import { form } from "../modules/orders/ui/form"; export const page = form;', 'modules/orders/ui/form.ts': 'import { writer } from "../infrastructure/writer"; export const form = writer;' }, result => {
  assert.match(result.errors.join(' '), /deep-module-import/);
  assert.match(result.errors.join(' '), /ui-imports-infrastructure/);
}));
test('detect runtime cycles and type-only cycles separately', () => {
  withFixture({ 'modules/a/model/a.ts': 'import { b } from "./b"; export const a = b;', 'modules/a/model/b.ts': 'import { a } from "./a"; export const b = a;' }, result => {
    assert.match(result.errors.join(' '), /runtime-cycle/);
  });
  withFixture({ 'modules/a/model/a.ts': 'import type { B } from "./b"; export type A = { b?: B };', 'modules/a/model/b.ts': 'import type { A } from "./a"; export type B = { a?: A };' }, result => {
    assert.equal(result.errors.length, 0);
    assert.match(result.warnings.join(' '), /source-level-cycle/);
  });
});
test('reject routes importing app and domain importing infra', () => withFixture({ ...base, 'app/setup.ts': 'export const setup = 1;', 'routes/orders.ts': 'import { setup } from "../app/setup"; export const page = setup;', 'modules/orders/domain/order.ts': 'import { writer } from "../infrastructure/writer"; export type Order = typeof writer;' }, result => {
  assert.match(result.errors.join(' '), /routes-import-app/);
  assert.match(result.errors.join(' '), /pure-domain-import/);
}));
test('reject self barrel and detect unresolved relative import', () => withFixture({ ...base, 'modules/orders/ui/form.ts': 'import { form } from "../index"; import { bad } from "./not-found"; export const f = form;' }, result => {
  assert.match(result.errors.join(' '), /no-self-barrel/);
  assert.match(result.errors.join(' '), /unresolved internal import/);
}));

test('detect re-exports and literal dynamic imports across boundaries', () => withFixture({ ...base,
  'shared/ui/button.ts': 'export { form } from "../../modules/orders/ui/form";',
  'routes/orders.ts': 'export const page = import("../modules/orders/domain/order");',
}, result => {
  assert.match(result.errors.join(' '), /shared-must-be-independent/);
  assert.match(result.errors.join(' '), /deep-module-import/);
}));
test('reject domain imports from shared technical infrastructure', () => withFixture({ ...base,
  'shared/api/client.ts': 'export const get = () => 1;',
  'modules/orders/domain/order.ts': 'import { get } from "../../../shared/api/client"; export type Order = { id: ReturnType<typeof get> };',
}, result => {
  assert.match(result.errors.join(' '), /pure-layer-imports-technical-shared/);
}));

test('pure domain cannot import React even with unresolved node_modules', () => withFixture({
  ...base, 'modules/orders/domain/order.ts': 'import { useEffect } from "react"; export const x = useEffect;',
}, result => assert.match(result.errors.join(' '), /pure-layer-external-package/)));
test('Windows-style module paths identify self barrels', () => {
  const { isSelfBarrel, normPath } = require('./check-boundaries.cjs');
  assert.equal(isSelfBarrel({ module: 'orders' }, { relative: normPath(String.raw`modules\orders\index.ts`) }), true);
});
test('empty imports emit runtime edges and cycle detection must catch them', () => withFixture({
  'modules/a/model/a.ts': 'import {} from "./b"; export const a = 1;',
  'modules/a/model/b.ts': 'import {} from "./a"; export const b = 2;',
}, result => assert.match(result.errors.join(' '), /runtime-cycle/)));
test('verbatimModuleSyntax retains inline type-only named imports', () => withFixture({
  '../tsconfig.json': '{"compilerOptions":{"verbatimModuleSyntax":true,"module":"ESNext"}}',
  'modules/a/model/a.ts': 'import { type B } from "./b"; export type A = {b?: B};',
  'modules/a/model/b.ts': 'import { type A } from "./a"; export type B = {a?: A};',
}, result => assert.match(result.errors.join(' '), /runtime-cycle/)));
test('baseUrl paths do not bypass sibling and private-import checks', () => withFixture({
  ...base,
  '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src"}}',
  'modules/billing/ui/pay.ts': 'import { form } from "modules/orders/ui/form"; export const x = form;',
}, result => {
  assert.match(result.errors.join(' '), /sibling-module-dependency/);
}));
test('unresolved internal project aliases fail rather than silently skip', () => withFixture({
  ...base, '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src","paths":{"@/*":["*"]}}}',
  'routes/orders.ts': 'import { missing } from "@/modules/orders/absent"; export const a = missing;',
}, result => assert.match(result.errors.join(' '), /unresolved internal import/)));
test('unknown relative import remains unresolved even if directory exists', () => withFixture({
  ...base, 'modules/orders/ui/directory/index.ts': 'export const x = 1;',
  'routes/orders.ts': 'import { x } from "../modules/orders/ui/directory/not-here"; export const f = x;',
}, result => assert.match(result.errors.join(' '), /unresolved internal import/)));
test('syntax errors in TSX are surfaced', () => withFixture({
  'modules/orders/ui/bad.tsx': 'export const Bad = () => <div>',
}, result => assert.match(result.errors.join(' '), /syntax-error/)));
test('an explicitly reviewed one-way public API exception can be allowed', () => withFixture({
  ...base, '../architecture.config.json': '{"allowCrossModule":{"payments":["orders"]}}',
  'modules/payments/ui/pay.ts': 'import type { Order } from "../../orders/index"; export type P = Order;',
  'modules/orders/index.ts': 'export type { Order } from "./domain/order";',
}, result => assert.deepEqual(result.errors, [])));
test('without the explicit exception, public sibling imports are denied', () => withFixture({
  ...base,
  'modules/payments/application/pay.ts': 'import type { Order } from "../../orders/index"; export type P = Order;',
  'modules/orders/index.ts': 'export type { Order } from "./domain/order";',
}, result => assert.match(result.errors.join(' '), /sibling-module-dependency/)));

test('CLI exits nonzero for violations and zero for compliant input', () => {
  const { spawnSync } = require('node:child_process');
  const bad = setup({ 'shared/x.ts': 'import { order } from "../modules/orders/index"; export const x = order;', 'modules/orders/index.ts': 'export const order = 1;' });
  const good = setup({ 'shared/x.ts': 'export const x = 1;' });
  try {
    const tool = path.join(__dirname, 'check-boundaries.cjs');
    assert.equal(spawnSync(process.execPath, [tool, bad.root], { encoding: 'utf8' }).status, 1);
    assert.equal(spawnSync(process.execPath, [tool, good.root], { encoding: 'utf8' }).status, 0);
  } finally { bad.cleanup(); good.cleanup(); }
});
test('test-only imports are excluded from pure production package restrictions', () => withFixture({
  'modules/orders/domain/order.ts': 'export const total = 1;',
  'modules/orders/domain/order.test.ts': 'import { it } from "vitest"; import { total } from "./order"; it("works", () => total);',
}, result => assert.deepEqual(result.errors, [])));
test('paths wildcard cannot mask a forbidden external import', () => withFixture({
  '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src","paths":{"*":["*"]}}}',
  'modules/orders/domain/order.ts': 'import { useEffect } from "react"; export const f = useEffect;',
}, result => assert.match(result.errors.join(' '), /pure-layer-external-package|unresolved internal import/)));

test('reject shared coupling to domain declaration files', () => withFixture({
  'shared/ui/button.ts': 'import type { Order } from "../../modules/orders/order"; export type X = Order;',
  'modules/orders/order.d.ts': 'export interface Order { id: string; }',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('scan .mjs and .cjs import edges rather than skipping files', () => withFixture({
  'shared/unsafe.mjs': 'import { x } from "../modules/orders/index.mjs"; export const y = x;',
  'modules/orders/index.mjs': 'export const x = 1;',
  'shared/unsafe.cjs': 'const thing = require("../modules/orders/index.cjs"); module.exports = thing;',
  'modules/orders/index.cjs': 'module.exports = { id: 1 };',
}, result => {
  assert.equal(result.count, 4);
  assert.equal(result.errors.filter(e => /shared-must-be-independent/.test(e)).length, 2);
}));

test('detect import equals require references in TypeScript', () => withFixture({
  'shared/ui/button.ts': 'import Order = require("../../modules/orders/index"); export const v = Order;',
  'modules/orders/index.ts': 'export const x = 1;',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('cross-module exceptions never permit domain or application imports', () => withFixture({
  '../architecture.config.json': '{"allowCrossModule":{"payments":["orders"]}}',
  'modules/orders/index.ts': 'export { component } from "./ui/component";',
  'modules/orders/ui/component.ts': 'export const component = 1;',
  'modules/payments/domain/total.ts': 'import { component } from "../../orders"; export const x = component;',
  'modules/payments/application/pay.ts': 'import type { component } from "../../orders"; export type T = typeof component;',
}, result => {
  assert.equal(result.errors.filter(e => /cross-module-pure-layer/.test(e)).length, 2);
}));

test('reject approved type-only cycles that span modules', () => withFixture({
  '../architecture.config.json': '{"allowCrossModule":{"orders":["payments"],"payments":["orders"]}}',
  'modules/orders/index.ts': 'import type { P } from "../payments"; export type O = { p?: P };',
  'modules/payments/index.ts': 'import type { O } from "../orders"; export type P = { o?: O };',
}, result => assert.match(result.errors.join(' '), /cross-module-cycle/)));

test('do not reject independent intra-module type-only cycles', () => withFixture({
  'modules/orders/model/a.ts': 'import type { B } from "./b"; export type A = { b?: B };',
  'modules/orders/model/b.ts': 'import type { A } from "./a"; export type B = { a?: A };',
}, result => { assert.deepEqual(result.errors, []); assert.match(result.warnings.join(' '), /source-level-cycle/); }));

test('reject an empty source tree rather than reporting a misleading pass', () => withFixture({
  'ignored.md': '# Empty project',
}, result => assert.match(result.errors.join(' '), /no-source-files/)));

test('relative CSS asset is valid and a missing asset is a reported error', () => {
  withFixture({
    'main.tsx': 'import "./style.css"; export const app = 1;',
    'style.css': 'body { color: black; }',
  }, result => assert.deepEqual(result.errors, []));
  withFixture({
    'main.tsx': 'import "./not-here.css"; export const app = 1;',
  }, result => assert.match(result.errors.join(' '), /missing-static-asset/));
});

test('reject domain importing generated API DTOs directly', () => withFixture({
  'modules/orders/domain/order.ts': 'import type { OrderDto } from "../../../generated/api/order"; export type Order = OrderDto;',
  'generated/api/order.ts': 'export interface OrderDto { id: string }',
}, result => assert.match(result.errors.join(' '), /pure-layer-imports-technical/)));

test('reject application importing a shared HTTP client', () => withFixture({
  'modules/orders/application/place.ts': 'import { get } from "../../../shared/api/http"; export const go = get;',
  'shared/api/http.ts': 'export const get = () => 1;',
}, result => assert.match(result.errors.join(' '), /pure-layer-imports-technical-shared/)));

test('pure shared libraries cannot import React or shared infrastructure', () => withFixture({
  'shared/lib/number.ts': 'import { useMemo } from "react"; export const x = useMemo;',
  'shared/lib/other.ts': 'import { get } from "../api/http"; export const y = get;',
  'shared/api/http.ts': 'export const get = () => 1;',
  'modules/orders/domain/order.ts': 'import { x } from "../../../shared/lib/number"; export const order = x;',
}, result => {
  assert.match(result.errors.join(' '), /pure-layer-external-package/);
  assert.match(result.errors.join(' '), /pure-layer-imports-technical-shared/);
}));

test('two-argument literal dynamic imports and requires are checked', () => withFixture({
  'modules/orders/index.ts': 'export const order = 1;',
  'shared/util.ts': 'export const a = import("../modules/orders/index", { with: { type: "json" } });',
  'shared/util2.ts': 'export const b = require("../modules/orders/index", undefined);',
}, result => assert.equal(result.errors.filter(e => e.includes('shared-must-be-independent')).length, 2)));

test('custom aliases resolving outside scanned src cannot evade enforcement', () => withFixture({
  '../tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@external/*":["outside/*"]}}}',
  '../outside/secret.ts': 'export const leaked = 123;',
  'modules/orders/domain/order.ts': 'import { leaked } from "@external/secret"; export const order = leaked;',
}, result => assert.match(result.errors.join(' '), /outside-source-import/)));

test('extension matching excludes unextended filenames ending in ts and js', () => withFixture({
  'assets': 'this is not valid TypeScript!',
  'robots': 'this is not valid TypeScript!',
  'archivejs': 'this is not valid TypeScript!',
  'shared/lib/example.ts': 'export const valid = 1;',
}, result => {
  assert.equal(result.count, 1);
  assert.deepEqual(result.errors, []);
}));

test('pure application may import a pure shared library', () => withFixture({
  'shared/lib/money.ts': 'export const amount = 10;',
  'modules/orders/application/place.ts': 'import { amount } from "../../../shared/lib/money"; export const price = amount;',
}, result => assert.deepEqual(result.errors, [])));

test('tsconfig path-alias asset is allowed only when the target actually exists', () => {
  withFixture({
    '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src","paths":{"@/*":["*"]}}}',
    'main.tsx': 'import "@/style.css"; export const app = 1;',
    'style.css': 'body { margin: 0 }',
  }, result => assert.deepEqual(result.errors, []));
  withFixture({
    '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src","paths":{"@/*":["*"]}}}',
    'main.tsx': 'import "@/missing.css"; export const app = 1;',
  }, result => assert.match(result.errors.join(' '), /missing-static-asset/));
});

test('pure layers reject imported styles even when the asset exists', () => {
  withFixture({
    'modules/orders/domain/order.ts': 'import "../ui/styles.css"; export const value = 1;',
    'modules/orders/ui/styles.css': ':root { color: red }',
  }, result => assert.match(result.errors.join(' '), /pure-layer-static-asset/));
  withFixture({
    'modules/orders/application/order.ts': 'import "../ui/styles.css"; export const value = 1;',
    'modules/orders/ui/styles.css': ':root { color: red }',
  }, result => assert.match(result.errors.join(' '), /pure-layer-static-asset/));
  withFixture({
    'shared/lib/util.ts': 'import "./styles.css"; export const value = 1;',
    'shared/lib/styles.css': ':root { color: red }',
  }, result => assert.match(result.errors.join(' '), /pure-layer-static-asset/));
});

test('UI and application composition may import existing stylesheets', () => withFixture({
  'app/main.tsx': 'import "./app.css"; export const app = 1;',
  'app/app.css': ':root { color: blue }',
  'modules/orders/ui/view.tsx': 'import "./view.css"; export const view = 1;',
  'modules/orders/ui/view.css': ':root { color: red }',
}, result => assert.deepEqual(result.errors, [])));

test('approved JavaScript module public APIs accept index.mjs and index.cjs', () => withFixture({
  '../architecture.config.json': '{"allowCrossModule":{"payments":["orders"]}}',
  'modules/orders/index.mjs': 'export const order = 1;',
  'modules/orders/index.cjs': 'module.exports = { order: 1 };',
  'modules/payments/ui/pay.mjs': 'import { order } from "../../orders/index.mjs"; export const paid = order;',
  'modules/payments/ui/pay.cjs': 'const orders = require("../../orders/index.cjs"); module.exports = orders;',
  'routes/home.mjs': 'import { order } from "../modules/orders/index.mjs"; export const home = order;',
}, result => assert.deepEqual(result.errors, [])));

test('self-barrel imports are rejected for JavaScript module entrypoints', () => withFixture({
  'modules/orders/index.mjs': 'export const value = 1;',
  'modules/orders/ui/form.mjs': 'import { value } from "../index.mjs"; export const form = value;',
}, result => assert.match(result.errors.join(' '), /no-self-barrel/)));

test('static assets never bypass shared ownership or sibling module privacy', () => {
  withFixture({
    'shared/ui/button.tsx': 'import "../../modules/orders/ui/order.css"; export const Button = () => 1;',
    'modules/orders/ui/order.css': '.order { color: red }',
  }, result => assert.match(result.errors.join(' '), /shared-must-be-independent/));
  withFixture({
    'modules/payments/ui/payment.tsx': 'import "../../orders/ui/order.css"; export const Payment = () => 1;',
    'modules/orders/ui/order.css': '.order { color: red }',
  }, result => assert.match(result.errors.join(' '), /sibling-module-dependency/));
  withFixture({
    'app/start.tsx': 'import "../modules/orders/ui/order.css"; export const App = () => 1;',
    'modules/orders/ui/order.css': '.order { color: red }',
  }, result => assert.match(result.errors.join(' '), /deep-module-import/));
});

test('valid same-owner CSS imports still pass after ownership enforcement', () => withFixture({
  'modules/orders/ui/order.css': '.order { color: red }',
  'modules/orders/ui/order.tsx': 'import "./order.css"; export const Order = () => 1;',
  'shared/ui/button.css': '.button { color: blue }',
  'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
  'app/app.css': ':root { color: blue }',
  'app/main.tsx': 'import "./app.css"; export const app = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('JSON imports are valid local data dependencies, not TypeScript source edges', () => withFixture({
  'app/config.json': '{"theme":"dark"}',
  'app/main.ts': 'import config from "./config.json"; export const theme = config.theme;',
  'modules/orders/domain/tax.json': '{"tax":10}',
  'modules/orders/domain/tax.ts': 'import tax from "./tax.json"; export const cents = tax.tax;',
}, result => assert.deepEqual(result.errors, [])));

test('JSON import targets must exist and must respect ownership', () => {
  withFixture({
    'app/main.ts': 'import missing from "./missing.json"; export const config = missing;',
  }, result => assert.match(result.errors.join(' '), /missing-static-asset/));
  withFixture({
    'shared/ui/button.ts': 'import order from "../../modules/orders/domain/order.json"; export const value = order;',
    'modules/orders/domain/order.json': '{"id":1}',
  }, result => assert.match(result.errors.join(' '), /shared-must-be-independent/));
  withFixture({
    'modules/payments/ui/payment.ts': 'import order from "../../orders/domain/order.json"; export const value = order;',
    'modules/orders/domain/order.json': '{"id":1}',
  }, result => assert.match(result.errors.join(' '), /sibling-module-dependency/));
  withFixture({
    'modules/orders/domain/order.ts': 'import schema from "../../../generated/api/schema.json"; export const value = schema;',
    'generated/api/schema.json': '{"type":"object"}',
  }, result => assert.match(result.errors.join(' '), /pure-layer-imports-technical/));
});

test('assets resolving outside the scanned root cannot bypass the boundary', () => withFixture({
  'app/start.ts': 'import "../../external/style.css"; export const app = 1;',
  '../external/style.css': ':root { color: red }',
}, result => assert.match(result.errors.join(' '), /outside-source-import/)));

test('runtime cycle diagnostics contain exactly one closing node', () => withFixture({
  'modules/orders/model/a.ts': 'import { b } from "./b"; export const a = b;',
  'modules/orders/model/b.ts': 'import { a } from "./a"; export const b = a;',
}, result => {
  assert.ok(result.errors.some(error =>
    error === 'runtime-cycle: modules/orders/model/a.ts -> modules/orders/model/b.ts -> modules/orders/model/a.ts'));
  assert.ok(!result.errors.some(error => /a\.ts -> a\.ts/.test(error)));
}));

test('asset path aliases take precedence over baseUrl fallback files', () => withFixture({
  '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src","paths":{"@styles/*":["modules/payments/ui/*"]}}}',
  'modules/orders/ui/view.tsx': 'import "@styles/view.css"; export const View = () => 1;',
  'modules/payments/ui/view.css': '.payment { color: red }',
  '@styles/view.css': '.shadow { color: blue }',
}, result => assert.match(result.errors.join(' '), /sibling-module-dependency/)));

test('source symlinks cannot disguise a business module as pure shared code', t => {
  const fixture = setup({
    'modules/orders/domain/order.ts': 'export type Order = { id: string };',
    'shared/lib/use.ts': 'import type { Order } from "./alias"; export type Use = Order;',
  });
  try {
    try {
      fs.symlinkSync(path.join(fixture.root, 'modules/orders/domain/order.ts'),
        path.join(fixture.root, 'shared/lib/alias.ts'), 'file');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('OS disallows file symlinks');
      throw error;
    }
    const result = check(fixture.root);
    assert.match(result.errors.join(' '), /source-symlink-ownership/);
    assert.match(result.errors.join(' '), /shared-must-be-independent/);
  } finally { fixture.cleanup(); }
});

test('source symlinks pointing outside src are always reported', t => {
  const fixture = setup({
    '../external.ts': 'export const external = 1;',
    'shared/lib/use.ts': 'import { external } from "./alias"; export const value = external;',
  });
  try {
    try {
      fs.symlinkSync(path.join(fixture.root, '../external.ts'),
        path.join(fixture.root, 'shared/lib/alias.ts'), 'file');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('OS disallows file symlinks');
      throw error;
    }
    assert.match(check(fixture.root).errors.join(' '), /outside-source-symlink/);
  } finally { fixture.cleanup(); }
});

test('same-owner source-file aliases are not treated as different modules', t => {
  const fixture = setup({
    'shared/lib/real.ts': 'export const value = 1;',
    'shared/lib/consumer.ts': 'import { value } from "./alias"; export const x = value;',
  });
  try {
    try {
      fs.symlinkSync(path.join(fixture.root, 'shared/lib/real.ts'),
        path.join(fixture.root, 'shared/lib/alias.ts'), 'file');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('OS disallows file symlinks');
      throw error;
    }
    assert.deepEqual(check(fixture.root).errors, []);
  } finally { fixture.cleanup(); }
});

test('reject a module that mixes simple and complex layer layouts', () => withFixture({
  'modules/orders/model/product.ts': 'export const product = 1;',
  'modules/orders/domain/order.ts': 'export const order = 1;',
}, result => assert.match(result.errors.join(' '), /mixed-module-layout/)));

test('a justified temporary migration can explicitly permit mixed layouts', () => withFixture({
  '../architecture.config.json': '{"allowMixedLayouts":{"orders":"Gradual migration tracked by ticket #123"}}',
  'modules/orders/model/product.ts': 'export const product = 1;',
  'modules/orders/domain/order.ts': 'export const order = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('empty mixed-layout migration reasons are invalid', () => {
  const f = setup({
    '../architecture.config.json': '{"allowMixedLayouts":{"orders":" "}}',
    'modules/orders/model/product.ts': 'export const product = 1;',
    'modules/orders/domain/order.ts': 'export const order = 1;',
  });
  try { assert.throws(() => check(f.root), /Invalid architecture.config.json/); }
  finally { f.cleanup(); }
});

test('migration exceptions do not permit direct simple-to-complex layer coupling', () => withFixture({
  '../architecture.config.json': '{"allowMixedLayouts":{"orders":"Migrate API clients into infrastructure"}}',
  'modules/orders/api/request.ts': 'import { http } from "../infrastructure/http"; export const request = http;',
  'modules/orders/infrastructure/http.ts': 'export const http = 1;',
}, result => assert.match(result.errors.join(' '), /mixed-mode-import/)));

test('independent simple and complex modules can coexist in one app', () => withFixture({
  'modules/catalog/api/list.ts': 'export const list = () => [];',
  'modules/catalog/model/product.ts': 'export type Product = { id: string };',
  'modules/orders/domain/order.ts': 'export type Order = { id: string };',
  'modules/orders/application/use-case.ts': 'import type { Order } from "../domain/order"; export type Save = (order: Order) => void;',
}, result => assert.deepEqual(result.errors, [])));

test('Vite lazy and eager glob imports fail closed rather than skipping private dependencies', () => {
  withFixture({
    'shared/ui/collection.ts': 'export const all = import.meta.glob("../../modules/orders/ui/*.tsx");',
    'modules/orders/ui/form.tsx': 'export const Form = () => 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-glob/));
  withFixture({
    'modules/orders/ui/collection.ts': 'export const all = import.meta.glob("./*.tsx", { eager: true });',
    'modules/orders/ui/form.tsx': 'export const Form = () => 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-glob/));
  withFixture({
    'shared/ui/collection.ts': 'export const all = import.meta.globEager("../../modules/orders/ui/*.tsx");',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-glob/));
});

test('Vite-only alias definitions must be explicitly mirrored in checker config', () => withFixture({
  '../vite.config.ts': 'export default { resolve: { alias: { "@orders-private": "/src/modules/orders/ui/form" } } };',
  'shared/ui/button.ts': 'import { form } from "@orders-private"; export const b = form;',
  'modules/orders/ui/form.ts': 'export const form = 1;',
}, result => assert.match(result.errors.join(' '), /unverified-vite-alias/)));

test('configured Vite aliases enforce the same module ownership rules', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@orders-private": fileURLToPath(new URL("./src/modules/orders/ui/form.ts", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@orders-private":"src/modules/orders/ui/form.ts"}}',
  'shared/ui/button.ts': 'import { form } from "@orders-private"; export const b = form;',
  'modules/orders/ui/form.ts': 'export const form = 1;',
}, result => {
  assert.match(result.errors.join(' '), /shared-must-be-independent/);
  assert.match(result.errors.join(' '), /deep-module-import/);
}));

test('configured Vite alias can import permitted public API', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@orders": fileURLToPath(new URL("./src/modules/orders", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@orders":"src/modules/orders"}}',
  'app/setup.ts': 'import { order } from "@orders"; export const setup = order;',
  'modules/orders/index.ts': 'export const order = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('computed Vite alias config fails closed', () => withFixture({
  '../vite.config.ts': 'export default { resolve: { alias: buildAliases() } };',
  'app/setup.ts': 'export const setup = 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/)));

test('Vite root-absolute source imports cannot bypass shared ownership', () => withFixture({
  'shared/ui/button.ts': 'import { order } from "/src/modules/orders/index"; export const b = order;',
  'modules/orders/index.ts': 'export const order = 1;',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('configuration prototype properties are never treated as layout exemptions', () => withFixture({
  'modules/toString/domain/order.ts': 'export const order = 1;',
  'modules/toString/model/order.ts': 'export const draft = 1;',
  'modules/constructor/domain/order.ts': 'export const order = 1;',
  'modules/constructor/api/order.ts': 'export const api = 1;',
}, result => assert.equal(result.errors.filter(e => e.includes('mixed-module-layout')).length, 2)));

test('an explicitly documented own-property migration exception is honored', () => withFixture({
  '../architecture.config.json': '{"allowMixedLayouts":{"toString":"Migration in review"}}',
  'modules/toString/domain/order.ts': 'export const order = 1;',
  'modules/toString/model/order.ts': 'export const draft = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('Vite aliases that disagree with checker map are rejected', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@safe": fileURLToPath(new URL("./src/modules/orders/ui/private.ts", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@safe":"src/shared/lib/safe.ts"}}',
  'app/setup.ts': 'export const setup = 1;',
}, result => assert.match(result.errors.join(' '), /vite-alias-target-mismatch/)));

test('dynamic alias expressions without inspectable targets fail closed', () => withFixture({
  '../vite.config.ts': 'export default { resolve: { alias: { "@safe": resolveAliasDynamically() } } };',
  '../architecture.config.json': '{"viteAliases":{"@safe":"src/shared/lib/safe.ts"}}',
  'app/setup.ts': 'export const setup = 1;',
}, result => assert.match(result.errors.join(' '), /unverifiable-vite-alias-target/)));

test('Vite shorthand and computed resolve configurations fail closed', () => {
  withFixture({
    '../vite.config.ts': 'const resolve = { alias: { "@orders": "/some/path" } }; export default defineConfig({ resolve });',
    'shared/ui/view.ts': 'import { order } from "@orders"; export const view = order;',
    'modules/orders/index.ts': 'export const order = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/));
  withFixture({
    '../vite.config.ts': 'export default defineConfig({ resolve: makeResolveConfig() });',
    'app/setup.ts': 'export const setup = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/));
});

test('Vite config spreads, alias spreads and imported configs fail closed', () => {
  for (const config of [
    'export default defineConfig({ ...sharedConfig, plugins: [] });',
    'export default defineConfig(sharedConfig);',
    'export default defineConfig({ resolve: { ...resolveConfig } });',
    'export default { resolve: { alias: { ...aliases } } };',
    'export default { resolve: { alias: { [name]: "/src/modules/orders" } } };',
  ]) withFixture({
    '../vite.config.ts': config,
    'app/setup.ts': 'export const setup = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/));
});

test('Vite alias map must reflect Vite config in both directions', () => withFixture({
  '../vite.config.ts': 'export default { plugins: [] };',
  '../architecture.config.json': '{"viteAliases":{"@orders":"src/modules/orders"}}',
  'app/setup.ts': 'export const setup = 1;',
}, result => assert.match(result.errors.join(' '), /unverified-vite-alias/)));

test('inline Vite defineConfig with no aliases is supported', () => withFixture({
  '../vite.config.ts': 'import { defineConfig } from "vitest/config"; export default defineConfig({ plugins: [], test: { environment: "jsdom" } });',
  'app/setup.ts': 'export const setup = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('variable dynamic import and computed require fail closed', () => {
  withFixture({
    'shared/ui/loader.ts': 'export async function load(path: string) { return import(path); }',
  }, result => assert.match(result.errors.join(' '), /unsupported-dynamic-import/));
  withFixture({
    'shared/ui/loader.cjs': 'const name = "orders"; module.exports = require(name);',
  }, result => assert.match(result.errors.join(' '), /unsupported-dynamic-require/));
});

test('Vite Worker new URL references respect module ownership', () => withFixture({
  'shared/ui/panel.ts': 'export const worker = new Worker(new URL("../../modules/orders/ui/worker.ts", import.meta.url), { type: "module" });',
  'modules/orders/ui/worker.ts': 'export const answer = 42;',
}, result => {
  assert.match(result.errors.join(' '), /shared-must-be-independent/);
  assert.match(result.errors.join(' '), /deep-module-import/);
}));

test('same-module Vite workers remain valid', () => withFixture({
  'modules/orders/ui/panel.ts': 'export const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });',
  'modules/orders/ui/worker.ts': 'export const answer = 42;',
}, result => assert.deepEqual(result.errors, [])));

test('new URL static assets respect ownership and pure-layer restrictions', () => {
  withFixture({
    'modules/orders/ui/panel.ts': 'export const icon = new URL("./assets/logo.svg", import.meta.url);',
    'modules/orders/ui/assets/logo.svg': '<svg/>',
  }, result => assert.deepEqual(result.errors, []));
  withFixture({
    'modules/orders/domain/order.ts': 'export const icon = new URL("../ui/assets/logo.svg", import.meta.url);',
    'modules/orders/ui/assets/logo.svg': '<svg/>',
  }, result => assert.match(result.errors.join(' '), /pure-layer-static-asset/));
  withFixture({
    'shared/ui/view.ts': 'export const icon = new URL("../../modules/orders/ui/logo.svg", import.meta.url);',
    'modules/orders/ui/logo.svg': '<svg/>',
  }, result => assert.match(result.errors.join(' '), /shared-must-be-independent/));
});

test('computed new URL targets fail closed', () => withFixture({
  'shared/ui/view.ts': 'export const icon = new URL(name, import.meta.url);',
}, result => assert.match(result.errors.join(' '), /unsupported-dynamic-url/)));

test('Vite template dynamic imports are rejected rather than silently bundled', () => withFixture({
  'shared/ui/loader.ts': 'export async function load(name: string) { return import(`../../modules/orders/ui/${name}.tsx`); }',
  'modules/orders/ui/form.tsx': 'export const Form = () => 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-dynamic-import/)));

test('Vite aliased asset directives resolve actual files', () => {
  for (const directive of ['url', 'raw', 'inline', 'no-inline']) {
    withFixture({
      '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@assets": fileURLToPath(new URL("./src/shared/ui/assets", import.meta.url)) } } };',
      '../architecture.config.json': '{"viteAliases":{"@assets":"src/shared/ui/assets"}}',
      'shared/ui/view.ts': 'import icon from "@assets/logo.svg?' + directive + '"; export const view = icon;',
      'shared/ui/assets/logo.svg': '<svg/>',
    }, result => assert.deepEqual(result.errors, []));
  }
});

test('aliased asset query imports still respect ownership and presence', () => {
  withFixture({
    '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@orders": fileURLToPath(new URL("./src/modules/orders/ui", import.meta.url)) } } };',
    '../architecture.config.json': '{"viteAliases":{"@orders":"src/modules/orders/ui"}}',
    'shared/ui/view.ts': 'import icon from "@orders/logo.svg?url"; export const view = icon;',
    'modules/orders/ui/logo.svg': '<svg/>',
  }, result => assert.match(result.errors.join(' '), /shared-must-be-independent/));
  withFixture({
    '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@assets": fileURLToPath(new URL("./src/shared/ui/assets", import.meta.url)) } } };',
    '../architecture.config.json': '{"viteAliases":{"@assets":"src/shared/ui/assets"}}',
    'shared/ui/view.ts': 'import icon from "@assets/absent.svg?url"; export const view = icon;',
  }, result => assert.match(result.errors.join(' '), /missing-static-asset/));
});

test('root-absolute Vite assets with queries retain boundaries', () => withFixture({
  'shared/ui/view.ts': 'import raw from "/src/modules/orders/ui/template.svg?raw"; export const view = raw;',
  'modules/orders/ui/template.svg': '<svg/>',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('source Vite worker query imports retain graph and layer rules', () => withFixture({
  'modules/orders/domain/order.ts': 'import worker from "../infrastructure/worker.ts?worker"; export const value = worker;',
  'modules/orders/infrastructure/worker.ts': 'export const run = 1;',
}, result => assert.match(result.errors.join(' '), /pure-domain-import/)));

test('TypeScript hash-prefixed path aliases are not mistaken for URL fragments', () => withFixture({
  '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src","paths":{"#util":["shared/lib/util.ts"]}}}',
  'shared/lib/util.ts': 'export const amount = 42;',
  'modules/orders/application/calculate.ts': 'import { amount } from "#util"; export const value = amount;',
}, result => assert.deepEqual(result.errors, [])));

test('raw source imports do not create spurious execution cycles', () => withFixture({
  'modules/orders/ui/a.ts': 'import text from "./b.ts?raw"; export const a = text;',
  'modules/orders/ui/b.ts': 'import { a } from "./a"; export const b = a;',
}, result => assert.deepEqual(result.errors, [])));

test('query-modified worker modules still contribute runtime cycle edges', () => withFixture({
  'modules/orders/ui/a.ts': 'import worker from "./b.ts?worker"; export const a = worker;',
  'modules/orders/ui/b.ts': 'import { a } from "./a"; export const b = a;',
}, result => assert.match(result.errors.join(' '), /runtime-cycle/)));

test('Vite aliases without trailing slash resolve prefix assets safely', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared/ui/assets", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@":"src/shared/ui/assets"}}',
  'shared/ui/view.ts': 'import icon from "@/logo.svg?url"; export const view = icon;',
  'shared/ui/assets/logo.svg': '<svg/>',
}, result => assert.deepEqual(result.errors, [])));

test('Vite alias precedence/order cannot silently disagree with checker config', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared", import.meta.url)), "@/orders": fileURLToPath(new URL("./src/modules/orders", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@/orders":"src/modules/orders","@":"src/shared"}}',
  'app/main.ts': 'export const main = 1;',
}, result => assert.match(result.errors.join(' '), /vite-alias-order-mismatch/)));

test('trailing slash aliases do not claim support that Vite does not provide', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@/": fileURLToPath(new URL("./src/shared/ui", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@/":"src/shared/ui"}}',
  'shared/ui/view.ts': 'export const view = 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/)));

test('transitive CSS @import cannot connect generic shared UI to business modules', () => withFixture({
  'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
  'shared/ui/button.css': '@import "../../modules/orders/ui/private.css";',
  'modules/orders/ui/private.css': '.private { color: blue }',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('CSS url() references cannot reach business-owned assets from shared code', () => withFixture({
  'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
  'shared/ui/button.css': '.button { background-image: url("../../modules/orders/ui/private.svg") }',
  'modules/orders/ui/private.svg': '<svg/>',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('nested CSS import chains still enforce ownership', () => withFixture({
  'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
  'shared/ui/button.css': '@import "./tokens.css";',
  'shared/ui/tokens.css': '@import "../../modules/orders/ui/private.css";',
  'modules/orders/ui/private.css': '.private { color: blue }',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('CSS imports within shared ownership are valid', () => withFixture({
  'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
  'shared/ui/button.css': '@import "./tokens.css"; .button { background: url("./icon.svg") }',
  'shared/ui/tokens.css': ':root { --accent: red; }',
  'shared/ui/icon.svg': '<svg/>',
}, result => assert.deepEqual(result.errors, [])));

test('CSS aliases are resolved before stylesheet ownership checks', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url";\nexport default { resolve: { alias: { "@orders": fileURLToPath(new URL("./src/modules/orders/ui", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@orders":"src/modules/orders/ui"}}',
  'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
  'shared/ui/button.css': '@import "@orders/private.css";',
  'modules/orders/ui/private.css': '.private { color: red }',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('Sass @use and @forward cannot bypass module ownership', () => withFixture({
  'shared/ui/button.tsx': 'import "./button.scss"; export const Button = () => 1;',
  'shared/ui/button.scss': '@use "../../modules/orders/ui/_tokens.scss";',
  'modules/orders/ui/_tokens.scss': '$accent: red;',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('CSS references to nonexistent files and dynamic URLs fail closed', () => {
  withFixture({
    'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
    'shared/ui/button.css': '@import "./missing.css";',
  }, result => assert.match(result.errors.join(' '), /missing-static-asset/));
  withFixture({
    'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
    'shared/ui/button.css': '.button { background: url(var(--external)) }',
  }, result => assert.match(result.errors.join(' '), /unsupported-css-url/));
});

test('same-owner stylesheet comments and data URLs do not create false violations', () => withFixture({
  'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
  'shared/ui/button.css': '/* @import "../../modules/orders/ui/private.css" */ .button { background: url(data:image/png;base64,abc) }',
}, result => assert.deepEqual(result.errors, [])));

test('standalone new URL references enforce ownership without causing runtime cycles', () => withFixture({
  'modules/orders/ui/a.ts': 'export const ref = new URL("./b.ts", import.meta.url);',
  'modules/orders/ui/b.ts': 'import { ref } from "./a"; export const b = ref;',
}, result => assert.deepEqual(result.errors, [])));

test('workers created from new URL remain executable dependency edges', () => withFixture({
  'modules/orders/ui/a.ts': 'export const worker = new Worker(new URL("./b.ts", import.meta.url), { type: "module" });',
  'modules/orders/ui/b.ts': 'import { worker } from "./a"; export const b = worker;',
}, result => assert.match(result.errors.join(' '), /runtime-cycle/)));

test('standalone URL imports still respect shared ownership', () => withFixture({
  'shared/ui/icon.ts': 'export const privateUrl = new URL("../../modules/orders/ui/worker.ts", import.meta.url);',
  'modules/orders/ui/worker.ts': 'export const code = 1;',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('uppercase CSS imports and Sass partial filename resolution respect ownership', () => {
  withFixture({
    'shared/ui/button.tsx': 'import "./button.css"; export const Button = () => 1;',
    'shared/ui/button.css': '@IMPORT "../../modules/orders/ui/private.css";',
    'modules/orders/ui/private.css': '.private { color: red }',
  }, result => assert.match(result.errors.join(' '), /shared-must-be-independent/));
  withFixture({
    'shared/ui/button.tsx': 'import "./button.scss"; export const Button = () => 1;',
    'shared/ui/button.scss': '@use "../../modules/orders/ui/tokens.scss";',
    'modules/orders/ui/_tokens.scss': '$accent: red;',
  }, result => assert.match(result.errors.join(' '), /shared-must-be-independent/));
});

test('multi-target Sass imports and computed load-css cannot bypass stylesheet ownership', () => {
  withFixture({
    'shared/ui/view.tsx': 'import "./view.scss"; export const View = () => 1;',
    'shared/ui/view.scss': '@import "./safe.css", "../../modules/orders/ui/private.css";',
    'shared/ui/safe.css': '.safe { color: blue }',
    'modules/orders/ui/private.css': '.private { color: red }',
  }, result => assert.match(result.errors.join(' '), /unsupported-css-dependency/));
  withFixture({
    'shared/ui/view.tsx': 'import "./view.scss"; export const View = () => 1;',
    'shared/ui/view.scss': '@include meta.load-css("../../modules/orders/ui/private.css");',
    'modules/orders/ui/private.css': '.private { color: red }',
  }, result => assert.match(result.errors.join(' '), /unsupported-css-dependency/));
});

test('a stylesheet api-to-ui edge uses the same direction rules as TypeScript', () => withFixture({
  'modules/orders/api/request.ts': 'import "./request.css"; export const request = 1;',
  'modules/orders/api/request.css': '@import "../ui/form.css";',
  'modules/orders/ui/form.css': '.order { color: red }',
}, result => assert.match(result.errors.join(' '), /api-imports-ui/)));

test('a stylesheet infrastructure-to-ui edge is rejected by the shared layer policy', () => withFixture({
  'modules/orders/infrastructure/client.ts': 'import "./client.css"; export const client = 1;',
  'modules/orders/infrastructure/client.css': '@import "../ui/form.css";',
  'modules/orders/ui/form.css': '.order { color: red }',
}, result => assert.match(result.errors.join(' '), /infrastructure-import/)));

test('same-module UI stylesheet imports remain permitted', () => withFixture({
  'modules/orders/ui/panel.tsx': 'import "./panel.css"; export const panel = 1;',
  'modules/orders/ui/panel.css': '@import "./tokens.css";',
  'modules/orders/ui/tokens.css': ':root { --accent: red }',
}, result => assert.deepEqual(result.errors, [])));

test('Less line comments do not invent cross-module imports', () => withFixture({
  'shared/ui/widget.ts': 'import "./widget.less"; export const widget = 1;',
  'shared/ui/widget.less': '// @import "../../modules/orders/ui/private.less";\\n.widget { color: red }',
  'modules/orders/ui/private.less': '.private { color: red }',
}, result => assert.deepEqual(result.errors, [])));

test('Less reference and inline imports within ownership are valid', () => withFixture({
  'shared/ui/widget.ts': 'import "./widget.less"; export const widget = 1;',
  'shared/ui/widget.less': '@import (reference, optional) "./tokens.less"; @import (inline) "./base.css";',
  'shared/ui/tokens.less': '@accent: red;',
  'shared/ui/base.css': '.base { color: red }',
}, result => assert.deepEqual(result.errors, [])));

test('Less reference and inline imports still reject private business dependencies', () => withFixture({
  'shared/ui/widget.ts': 'import "./widget.less"; export const widget = 1;',
  'shared/ui/widget.less': '@import (reference) "../../modules/orders/ui/private.less";',
  'modules/orders/ui/private.less': '.private { color: red }',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('image-set quoted alternatives cannot bypass stylesheet ownership', () => withFixture({
  'shared/ui/widget.ts': 'import "./widget.css"; export const widget = 1;',
  'shared/ui/widget.css': '.widget { background: image-set("../../modules/orders/ui/private.svg" 2x); }',
  'modules/orders/ui/private.svg': '<svg/>',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('valid same-owned image-set choices remain legal', () => withFixture({
  'shared/ui/widget.ts': 'import "./widget.css"; export const widget = 1;',
  'shared/ui/widget.css': '.widget { background: image-set("./a.svg" 1x, url("./b.svg") 2x); }',
  'shared/ui/a.svg': '<svg/>',
  'shared/ui/b.svg': '<svg/>',
}, result => assert.deepEqual(result.errors, [])));

test('unresolved image-set expressions are reported instead of silently accepted', () => withFixture({
  'shared/ui/widget.ts': 'import "./widget.css"; export const widget = 1;',
  'shared/ui/widget.css': '.widget { background: image-set(var(--asset) 1x); }',
}, result => assert.match(result.errors.join(' '), /unsupported-css-image-set/)));

test('missing optional Less imports are permitted without bypassing existing-file ownership', () => {
  withFixture({
    'shared/ui/view.ts': 'import "./view.less"; export const view = 1;',
    'shared/ui/view.less': '@import (optional) "./missing.less";',
  }, result => assert.deepEqual(result.errors, []));
  withFixture({
    'shared/ui/view.ts': 'import "./view.less"; export const view = 1;',
    'shared/ui/view.less': '@import (optional) "../../modules/orders/ui/private.less";',
    'modules/orders/ui/private.less': '.private { color: red }',
  }, result => assert.match(result.errors.join(' '), /shared-must-be-independent/));
});

test('Sass string interpolation cannot masquerade as a harmless fragment', () => withFixture({
  'shared/ui/view.ts': 'import "./view.scss"; export const view = 1;',
  'shared/ui/view.scss': '.view { background: url("#{${asset}}/private.svg"); }',
}, result => assert.match(result.errors.join(' '), /unsupported-css-dependency/)));

test('bare baseUrl imports outside src cannot masquerade as packages', () => withFixture({
  '../tsconfig.json': '{"compilerOptions":{"baseUrl":"."}}',
  '../internal/secret.ts': 'export const secret = 1;',
  'shared/ui/button.ts': 'import { secret } from "internal/secret"; export const button = secret;',
}, result => assert.match(result.errors.join(' '), /outside-source-import/)));
test('Vite helper locally shadowed as a function cannot certify aliases', () => withFixture({
  '../vite.config.ts': 'const fileURLToPath = () => "/tmp/private"; export default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@":"src/shared"}}',
  'shared/ui/button.ts': 'export const button = 1;',
}, result => assert.match(result.errors.join(' '), /(?:untrusted-vite-alias-helper|unsupported-vite-alias-config)/)));
test('shadowed URL constructor is not a trusted Vite alias expression', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url"; const URL = () => ({ pathname: "/tmp/private" }); export default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@":"src/shared"}}',
  'shared/ui/button.ts': 'export const button = 1;',
}, result => assert.match(result.errors.join(' '), /(?:untrusted-vite-alias-helper|unsupported-vite-alias-config)/)));
test('a directly imported Node URL helper remains supported', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url"; export default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@":"src/shared"}}',
  'shared/ui/button.ts': 'export const button = 1;',
}, result => assert.deepEqual(result.errors, [])));
test('more specific path mappings win over generic mappings for source assets', () => withFixture({
  '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src","paths":{"@*":["shared/ui/*"],"@orders/*":["modules/orders/*"]}}}',
  'shared/ui/widget.ts': 'import img from "@orders/ui/private.svg"; export const imgUrl = img;',
  'shared/ui/orders/ui/private.svg': '<svg/>',
  'modules/orders/ui/private.svg': '<svg/>',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));
test('stylesheets honor the same most-specific paths mapping', () => withFixture({
  '../tsconfig.json': '{"compilerOptions":{"baseUrl":"src","paths":{"@*":["shared/ui/*"],"@orders/*":["modules/orders/*"]}}}',
  'shared/ui/widget.ts': 'import "./widget.css"; export const widget = 1;',
  'shared/ui/widget.css': '.widget { background: url("@orders/ui/private.svg") }',
  'shared/ui/orders/ui/private.svg': '<svg/>',
  'modules/orders/ui/private.svg': '<svg/>',
}, result => assert.match(result.errors.join(' '), /shared-must-be-independent/)));

test('fixture setup preserves unbound Vite helpers without rewriting config', () => {
  const config = 'export default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared", import.meta.url)) } } };';
  const fixture = setup({
    '../vite.config.ts': config,
    '../architecture.config.json': '{"viteAliases":{"@":"src/shared"}}',
    'shared/lib/number.ts': 'export const number = 1;',
  });
  try {
    assert.equal(fs.readFileSync(path.join(fixture.root, '../vite.config.ts'), 'utf8'), config);
    assert.match(check(fixture.root).errors.join(' '), /(?:untrusted-vite-alias-helper|unsupported-vite-alias-config)/);
  } finally { fixture.cleanup(); }
});

test('pure domain, application and model reject unknown technical folders', () => {
  for (const layer of ['domain', 'application', 'model']) {
    withFixture({
      'integrations/http-client.ts': 'export const httpClient = () => 1;',
      ['modules/orders/' + layer + '/order.ts']:
        'import { httpClient } from "../../../integrations/http-client"; export const value = httpClient;',
    }, result => assert.match(result.errors.join(' '), /pure-layer-imports-nonpure-source/));
  }
});

test('pure shared rejects arbitrary top-level technical folders', () => withFixture({
  'utils/telemetry.ts': 'export const send = () => 1;',
  'shared/lib/metric.ts': 'import { send } from "../../utils/telemetry"; export const metric = send;',
}, result => assert.match(result.errors.join(' '), /pure-layer-imports-nonpure-source/)));

test('permitted pure module and shared dependencies remain valid', () => withFixture({
  'shared/lib/money.ts': 'export const cents = 5;',
  'modules/orders/domain/order.ts': 'import { cents } from "../../../shared/lib/money"; export const amount = cents;',
  'modules/orders/application/place.ts': 'import { amount } from "../domain/order"; export const price = amount;',
  'modules/catalog/model/product.ts': 'import { cents } from "../../../shared/lib/money"; export const price = cents;',
}, result => assert.deepEqual(result.errors, [])));

test('query-modified JSON is not pure data', () => {
  for (const query of ['url', 'raw', 'inline', 'no-inline', 'worker', 'unknown-plugin']) {
    withFixture({
      'modules/orders/domain/config.json': '{"tax":1}',
      'modules/orders/domain/order.ts': 'import config from "./config.json?' + query + '"; export const value = config;',
    }, result => assert.match(result.errors.join(' '), /pure-layer-static-asset/));
  }
});

test('query-modified TypeScript source is not a pure import', () => {
  for (const query of ['url', 'raw', 'worker', 'sharedworker']) {
    withFixture({
      'modules/orders/domain/source.ts': 'export const source = 1;',
      'modules/orders/domain/order.ts': 'import source from "./source.ts?' + query + '"; export const value = source;',
    }, result => assert.match(result.errors.join(' '), /pure-layer-static-asset/));
  }
});

test('new URL assets cannot masquerade as JSON configuration in pure code', () => withFixture({
  'modules/orders/domain/config.json': '{"tax":1}',
  'modules/orders/domain/order.ts': 'export const configUrl = new URL("./config.json", import.meta.url);',
}, result => assert.match(result.errors.join(' '), /pure-layer-static-asset/)));

test('ordinary owned JSON configuration in domain remains allowed', () => withFixture({
  'modules/orders/domain/config.json': '{"tax":1}',
  'modules/orders/domain/order.ts': 'import config from "./config.json"; export const value = config;',
}, result => assert.deepEqual(result.errors, [])));

test('CommonJS Vite .cjs and .cts configurations are discovered rather than ignored', () => {
  for (const ext of ['cjs', 'cts']) {
    withFixture({
      ['../vite.config.' + ext]: 'module.exports = { resolve: { alias: { "@hidden": "/src/modules/orders/ui" } } };',
      'app/start.ts': 'export const x = 1;',
    }, result => assert.match(result.errors.join(' '), /unverified-vite-alias/));
  }
});

test('simple static CommonJS Vite configs without aliases are supported', () => {
  for (const ext of ['cjs', 'cts']) withFixture({
    ['../vite.config.' + ext]: 'module.exports = { plugins: [] };',
    'app/start.ts': 'export const x = 1;',
  }, result => assert.deepEqual(result.errors, []));
});

test('dynamic or unverified CommonJS exports cannot bypass alias inspection', () => {
  withFixture({
    '../vite.config.cjs': 'module.exports = makeConfig();',
    'app/start.ts': 'export const x = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/));
});

test('custom Vite --config from package scripts cannot be silently ignored', () => withFixture({
  '../package.json': '{"scripts":{"build":"vite build --config custom.vite.config.ts"}}',
  '../custom.vite.config.ts': 'export default { resolve: { alias: { "@hidden": "/src/modules/orders/ui" } } };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('a declared custom Vite config is inspected and validated', () => withFixture({
  '../package.json': '{"scripts":{"build":"vite build --config custom.vite.config.ts","dev":"vite --config custom.vite.config.ts"}}',
  '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
  '../custom.vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('custom Vite aliases require the matching mirrored policy map', () => withFixture({
  '../package.json': '{"scripts":{"build":"vite build --config custom.vite.config.ts"}}',
  '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
  '../custom.vite.config.ts': 'export default { resolve: { alias: { "@hidden": "/src/modules/orders/ui" } } };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.match(result.errors.join(' '), /unverified-vite-alias/)));

test('scripts with different Vite configuration choices fail closed', () => withFixture({
  '../package.json': '{"scripts":{"build":"vite build","dev":"vite --config special.vite.config.ts"}}',
  '../architecture.config.json': '{"viteConfig":"special.vite.config.ts"}',
  '../vite.config.ts': 'export default { plugins: [] };',
  '../special.vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('custom Vite config paths cannot escape the project or use unsupported extensions', () => {
  withFixture({
    '../architecture.config.json': '{"viteConfig":"../external.config.ts"}',
    '../../external.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const x = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
  withFixture({
    '../architecture.config.json': '{"viteConfig":"custom.invalid"}',
    '../custom.invalid': 'export default { plugins: [] };',
    'app/start.ts': 'export const x = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('percent-encoded path segments cannot spoof a Vite alias ownership target', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url"; export default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared/%2e%2e/modules/orders/ui", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@":"src/shared/%2e%2e/modules/orders/ui"}}',
  'shared/ui/view.ts': 'import { x } from "@/hidden"; export const view = x;',
  'shared/%2e%2e/modules/orders/ui/hidden.ts': 'export const x = 1;',
  'modules/orders/ui/hidden.ts': 'export const x = 2;',
}, result => assert.match(result.errors.join(' '), /vite-alias-target-mismatch/)));

test('valid URL-encoded filename segments are decoded consistently', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url"; export default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared/lib/spaced%20dir", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@":"src/shared/lib/spaced dir"}}',
  'shared/lib/spaced dir/thing.ts': 'export const x = 1;',
  'shared/ui/view.ts': 'import { x } from "@/thing"; export const view = x;',
}, result => assert.deepEqual(result.errors, [])));

test('invalid encoded separators in Vite file URL aliases fail closed', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url"; export default { resolve: { alias: { "@": fileURLToPath(new URL("./src/shared/%2f/private", import.meta.url)) } } };',
  '../architecture.config.json': '{"viteAliases":{"@":"src/shared/%2f/private"}}',
  'shared/ui/view.ts': 'export const view = 1;',
}, result => assert.match(result.errors.join(' '), /unverifiable-vite-alias-url/)));

test('CommonJS alias maps cannot be changed by another top-level assignment', () => withFixture({
  '../vite.config.cjs': 'module.exports = { plugins: [] }; module.exports.resolve = { alias: { "@": "/src/modules/orders/ui" } };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/)));


test('custom Vite config symlinks cannot escape the project', t => {
  const fixture = setup({
    '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
    'app/start.ts': 'export const x = 1;',
  });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-outside-config-'));
  try {
    const target = path.join(outside, 'custom.vite.config.ts');
    fs.writeFileSync(target, 'export default { plugins: [] };');
    const link = path.join(fixture.root, '../custom.vite.config.ts');
    try { fs.symlinkSync(target, link, 'file'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('OS disallows symlinks');
      throw error;
    }
    assert.match(check(fixture.root).errors.join(' '), /config symlink escapes/);
  } finally {
    fixture.cleanup();
    fs.rmSync(outside, { force: true, recursive: true });
  }
});

test('declared custom Vite config cannot override an npm script using defaults', () => withFixture({
  '../package.json': '{"scripts":{"build":"vite build"}}',
  '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
  '../vite.config.ts': 'export default { resolve: { alias: { "@private": "/src/modules/orders/ui" } } };',
  '../custom.vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const value = 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('multiple Vite commands or --config flags in one script fail closed', () => {
  for (const command of [
    'vite build --config a.vite.config.ts && vite dev --config b.vite.config.ts',
    'vite build --config a.vite.config.ts --config b.vite.config.ts',
  ]) withFixture({
    '../package.json': JSON.stringify({ scripts: { build: command } }),
    '../architecture.config.json': '{"viteConfig":"a.vite.config.ts"}',
    '../a.vite.config.ts': 'export default { plugins: [] };',
    '../b.vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const value = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('CommonJS variable declarations cannot mutate a verified Vite alias', () => {
  for (const extra of [
    'const changed = (module.exports.resolve.alias["@safe"] = "/src/modules/orders/ui");',
    'const changed = Object.assign(module.exports.resolve.alias, { "@safe": "/src/modules/orders/ui" });',
    'var changed = (() => { module.exports.resolve.alias["@safe"] = "/src/modules/orders/ui"; })();',
  ]) withFixture({
    '../vite.config.cjs': 'module.exports = { resolve: { alias: { "@safe": "/src/shared/lib" } } }; ' + extra,
    '../architecture.config.json': '{"viteAliases":{"@safe":"src/shared/lib"}}',
    'shared/lib/safe.ts': 'export const safe = 1;',
    'app/start.ts': 'export const x = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/));
});

test('CommonJS use strict directive is inert and may precede a static export', () => withFixture({
  '../vite.config.cjs': '"use strict"; module.exports = { plugins: [] };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('eslint --config in a compound npm script cannot override the Vite config path', () => withFixture({
  '../package.json': '{"scripts":{"build":"eslint --config safe.vite.config.cjs && vite build"}}',
  '../architecture.config.json': '{"viteConfig":"safe.vite.config.cjs"}',
  '../safe.vite.config.cjs': 'module.exports = { plugins: [] };',
  '../vite.config.ts': 'export default { resolve: { alias: { "@private": "/src/modules/orders/ui" } } };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('Vite --config is resolved within its own compound-shell command', () => withFixture({
  '../package.json': '{"scripts":{"build":"eslint --config eslint.config.mjs && vite build --config safe.vite.config.cjs"}}',
  '../architecture.config.json': '{"viteConfig":"safe.vite.config.cjs"}',
  '../safe.vite.config.cjs': 'module.exports = { plugins: [] };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('Vite JavaScript executable in npm script uses the chosen custom config', () => withFixture({
  '../package.json': '{"scripts":{"build":"node node_modules/vite/bin/vite.js build --config custom.vite.config.ts"}}',
  '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
  '../custom.vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('quoted shell separators do not split the Vite configuration command', () => withFixture({
  '../package.json': '{"scripts":{"build":"echo \"not && a command\" && vite build --config custom.vite.config.ts"}}',
  '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
  '../custom.vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('Vite -c must be mirrored rather than silently using default config', () => withFixture({
  '../package.json': '{"scripts":{"build":"vite build -c hidden.vite.config.ts"}}',
  '../vite.config.ts': 'export default { plugins: [] };',
  '../hidden.vite.config.ts': 'export default { resolve: { alias: { "@": "/src/modules/orders/ui" } } };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('declared Vite -c config is validated as the effective config', () => withFixture({
  '../package.json': '{"scripts":{"build":"vite build -c custom.vite.config.ts"}}',
  '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
  '../custom.vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.deepEqual(result.errors, [])));

test('Vite --config=path and -c=path select declared config', () => {
  for (const flag of ['--config=', '-c=']) withFixture({
    '../package.json': JSON.stringify({scripts:{build:'vite build '+flag+'custom.vite.config.ts'}}),
    '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
    '../custom.vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.deepEqual(result.errors, []));
});

test('duplicate Vite short/long options must fail closed', () => withFixture({
  '../package.json': '{"scripts":{"build":"vite build -c custom.vite.config.ts --config custom.vite.config.ts"}}',
  '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
  '../custom.vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('working-directory changes must not silently inspect root Vite config', () => withFixture({
  '../package.json': '{"scripts":{"build":"cd nested && vite build"}}',
  '../vite.config.ts': 'export default { plugins: [] };',
  '../nested/vite.config.ts': 'export default { resolve: { alias: { "@": "/src/modules/orders/ui" } } };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('a positional Vite project root fails closed', () => {
  for (const command of ['vite build nested', 'vite nested', 'vite dev nested', 'vite build --root nested'])
    withFixture({
      '../package.json': JSON.stringify({scripts:{build:command}}),
      '../vite.config.ts': 'export default { plugins: [] };',
      '../nested/vite.config.ts': 'export default { resolve: { alias: { "@": "/src/modules/orders/ui" } } };',
      'app/start.ts': 'export const start = true;',
    }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('echoed vite tokens cannot impersonate the actual local executable', () => withFixture({
  '../package.json': '{"scripts":{"build":"echo vite --config safe.vite.config.ts && ./node_modules/.bin/vite build"}}',
  '../architecture.config.json': '{"viteConfig":"safe.vite.config.ts"}',
  '../safe.vite.config.ts': 'export default { plugins: [] };',
  '../vite.config.ts': 'export default { resolve: { alias: { "@hidden": "/src/modules/orders/ui" } } };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('local Vite executable discovers the real default aliases', () => withFixture({
  '../package.json': '{"scripts":{"build":"echo vite --config safe.vite.config.ts && ./node_modules/.bin/vite build"}}',
  '../vite.config.ts': 'export default { resolve: { alias: { "@hidden": "/src/modules/orders/ui" } } };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unverified-vite-alias/)));

test('unrecognized Vite wrappers and options must not silently trust defaults', () => {
  for (const command of [
    'npx --yes vite build -c hidden.vite.config.ts',
    'cross-env MODE=prod vite build -c hidden.vite.config.ts',
    'vite build -chidden.vite.config.ts',
  ]) withFixture({
    '../package.json': JSON.stringify({scripts:{build:command}}),
    '../vite.config.ts': 'export default { plugins: [] };',
    '../hidden.vite.config.ts': 'export default { resolve: { alias: { "@": "/src/modules/orders/ui" } } };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('a direct Node Vite CLI uses only its own -c flag', () => withFixture({
  '../package.json': '{"scripts":{"build":"echo --config decoy.ts && node ./node_modules/vite/bin/vite.js build -c custom.vite.config.ts"}}',
  '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
  '../custom.vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.deepEqual(result.errors, [])));

test('Windows-local Vite.cmd and Node CLI paths respect their own short config flag', () => {
  const scripts = [
    String.raw`.\node_modules\.bin\vite.cmd build -c custom.vite.config.ts`,
    String.raw`node .\node_modules\vite\bin\vite.js build -c custom.vite.config.ts`,
    'vite.cmd build -c custom.vite.config.ts',
  ];
  for (const command of scripts) withFixture({
    '../package.json': JSON.stringify({ scripts: { build: command } }),
    '../architecture.config.json': '{"viteConfig":"custom.vite.config.ts"}',
    '../custom.vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.deepEqual(result.errors, []));
});

test('Windows-local Vite executable cannot be spoofed by earlier echo text', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    build: String.raw`echo vite --config safe.vite.config.ts && .\node_modules\.bin\vite.cmd build`,
  } }),
  '../architecture.config.json': '{"viteConfig":"safe.vite.config.ts"}',
  '../safe.vite.config.ts': 'export default { plugins: [] };',
  '../vite.config.ts': 'export default { resolve: { alias: { "@hidden": "/src/modules/orders/ui" } } };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('embedded shell Vite builds must fail closed instead of trusting the default config', () => {
  const embedded = [
    "sh -c 'vite build --config hidden.vite.config.ts'",
    "bash -lc 'vite build --config hidden.vite.config.ts'",
    'cmd /c "vite build --config hidden.vite.config.ts"',
    'powershell -Command "vite build --config hidden.vite.config.ts"',
    'pwsh -Command "vite build --config hidden.vite.config.ts"',
    "cross-env MODE=prod sh -c 'vite build --config hidden.vite.config.ts'",
  ];
  for (const script of embedded) withFixture({
    '../package.json': JSON.stringify({ scripts: { build: script } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    '../hidden.vite.config.ts': 'export default { resolve: { alias: { "@hidden": "/src/modules/orders/ui" } } };',
    'app/start.ts': 'export const started = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('opaque shell launchers still fail closed when a custom config is declared', () =>
  withFixture({
    '../package.json': '{"scripts":{"build":"sh -c \'vite build --config hidden.vite.config.ts\'"}}',
    '../architecture.config.json': '{"viteConfig":"hidden.vite.config.ts"}',
    '../hidden.vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const started = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('programmatic Vite from node evaluation is not assumed to use defaults', () =>
  withFixture({
    '../package.json': JSON.stringify({ scripts: {
      build: 'node -e \'require("vite").build({configFile:"hidden.vite.config.ts"})\'',
    } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const started = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('Vite --host is optional while other required-value options remain required', () => {
  const valid = [
    'vite --host',
    'vite dev --host',
    'vite preview --host',
    'vite dev --host 0.0.0.0',
    'vite dev --host --port 3000',
    'vite dev --host=127.0.0.1',
    'vite dev --port 3000',
  ];
  for (const script of valid) withFixture({
    '../package.json': JSON.stringify({ scripts: { dev: script } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const started = true;',
  }, result => assert.deepEqual(result.errors, [], script));
  for (const script of ['vite dev --port', 'vite dev --outDir', 'vite dev --host=']) {
    withFixture({
      '../package.json': JSON.stringify({ scripts: { dev: script } }),
      '../vite.config.ts': 'export default { plugins: [] };',
      'app/start.ts': 'export const started = true;',
    }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
  }
});

test('an ambiguous host argument cannot swallow a Vite subcommand', () => withFixture({
  '../package.json': '{"scripts":{"dev":"vite --host build"}}',
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const started = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('the reference app compound build script remains supported', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    build: 'npm run arch && tsc --noEmit && vite build',
    arch: 'node ../../tools/check-boundaries.cjs src',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const started = true;',
}, result => assert.deepEqual(result.errors, [])));

test('shell command interpreters remain unsupported with intervening flags or script files', () => {
  for (const script of [
    "bash -e -c 'vite build -c hidden.vite.config.ts'",
    "pwsh -File scripts/build.ps1",
    "sh scripts/build.sh",
    "env MODE=prod bash -e -c 'vite build'",
  ]) withFixture({
    '../package.json': JSON.stringify({ scripts: { build: script } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const started = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('echoed shell interpreter names do not imply an executable Vite wrapper', () =>
  withFixture({
    '../package.json': '{"scripts":{"build":"echo bash -c hidden && vite build"}}',
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const started = true;',
  }, result => assert.deepEqual(result.errors, [])));

test('unbound and shadowed defineConfig cannot certify static alias configuration', () => {
  const configs = [
    'function defineConfig(config) { config.resolve.alias["@safe"] = "/private"; return config; } export default defineConfig({ resolve: { alias: { "@safe": "/safe" } } });',
    'const defineConfig = config => { config.resolve.alias["@safe"] = "/private"; return config; }; export default defineConfig({ resolve: { alias: { "@safe": "/safe" } } });',
    'export default defineConfig({ resolve: { alias: { "@safe": "/safe" } } });',
    'import { defineConfig } from "untrusted-helper"; export default defineConfig({ resolve: { alias: { "@safe": "/safe" } } });',
  ];
  for (const config of configs) withFixture({
    '../vite.config.ts': config,
    '../architecture.config.json': '{"viteAliases":{"@safe":"src/shared/lib"}}',
    'shared/lib/safe.ts': 'export const safe = true;',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/));
});

test('only a directly trusted Vite or Vitest defineConfig import can wrap a static object', () => {
  for (const origin of ['vite', 'vitest/config']) withFixture({
    '../vite.config.ts': 'import { defineConfig } from "' + origin + '"; export default defineConfig({ plugins: [] });',
    'app/start.ts': 'export const start = true;',
  }, result => assert.deepEqual(result.errors, []));
});

test('additional executable ESM declarations cannot mutate the verified configuration', () => {
  for (const extra of [
    'function mutate(config) { config.resolve.alias["@safe"] = "/private"; }',
    'const altered = (globalThis.URL = () => ({ href: "file:///private" }));',
    'class UnexpectedSideEffect { static value = globalThis.URL = () => 1; }',
  ]) withFixture({
    '../vite.config.ts': 'import { defineConfig } from "vite"; ' + extra +
      ' export default defineConfig({ resolve: { alias: { "@safe": "/safe" } } });',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-alias-config/));
});

test('opaque build runners cannot quietly verify a different default Vite config', () => {
  for (const script of [
    'node scripts/build.mjs',
    'tsx scripts/build.ts',
    'node ./scripts/build.mjs --config hidden.vite.config.ts',
    'python scripts/build.py',
    'npm run --silent custombuild',
    'npm run build:delegated',
  ]) withFixture({
    '../package.json': JSON.stringify({ scripts: { build: script } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    '../hidden.vite.config.ts': 'export default { resolve: { alias: { "@unsafe": "/private" } } };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('an external builder in a dev or namespaced build entrypoint is also rejected', () => {
  for (const key of ['dev', 'build:prod', 'preview', 'bundle']) withFixture({
    '../package.json': JSON.stringify({ scripts: { [key]: 'node scripts/hidden-build.js' } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('instrumentation script names cannot be repurposed to run an opaque builder', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    build: 'npm run arch && vite build',
    arch: 'node scripts/hidden-vite.mjs',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('an explicit local boundary check followed by Vite remains supported', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    build: 'npm run arch && tsc --noEmit && vite build',
    arch: 'node ../../tools/check-boundaries.cjs src',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.deepEqual(result.errors, [])));

test('delegated architecture checker cannot hide a second build after an accepted prefix', () => {
  const appended = [
    'node ../../tools/check-boundaries.cjs src && node scripts/hidden-build.mjs',
    'node ../../tools/check-boundaries.cjs src | node scripts/hidden-build.mjs',
    'node ../../tools/check-boundaries.cjs src; node scripts/hidden-build.mjs',
    'node ../../tools/check-boundaries.cjs src > result.txt',
    'node ../../tools/check-boundaries.cjs src$(node scripts/hidden-build.mjs)',
  ];
  for (const arch of appended) withFixture({
    '../package.json': JSON.stringify({ scripts: { build: 'npm run arch && vite build', arch } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    '../hidden.vite.config.ts': 'export default { resolve: { alias: { "@hidden": "/private" } } };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('delegated architecture checker requires an actual complete and safe script', () => {
  for (const arch of [
    undefined,
    'node scripts/hidden-build.mjs',
    'node ../../tools/check-boundaries.cjs src --exec scripts/hidden-build.mjs',
    'node ../../tools/check-boundaries.cjs src || true',
  ]) withFixture({
    '../package.json': JSON.stringify({
      scripts: {
        build: 'npm run arch && vite build',
        ...(arch === undefined ? {} : { arch }),
      },
    }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('delegated architecture checker cannot hide builds in its npm lifecycle hooks', () => {
  for (const hook of ['prearch', 'postarch']) withFixture({
    '../package.json': JSON.stringify({ scripts: {
      build: 'npm run arch && vite build',
      arch: 'node ../../tools/check-boundaries.cjs src',
      [hook]: 'node scripts/hidden-build.mjs',
    } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('pre and post npm build or dev hooks cannot execute opaque builders unchecked', () => {
  for (const hook of ['prebuild', 'postbuild', 'predev', 'postdev', 'prebuild:prod', 'postbuild:prod']) {
    const name = hook.includes('dev') ? 'dev' : hook.endsWith(':prod') ? 'build:prod' : 'build';
    withFixture({
      '../package.json': JSON.stringify({ scripts: {
        [name]: 'vite build',
        [hook]: 'node scripts/hidden-build.mjs',
      } }),
      '../vite.config.ts': 'export default { plugins: [] };',
      'app/start.ts': 'export const start = true;',
    }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
  }
});

test('explicit Vite lifecycle hooks remain supported and must use the same config', () => {
  withFixture({
    '../package.json': JSON.stringify({ scripts: {
      prebuild: 'vite build',
      build: 'vite build',
      postbuild: 'echo done',
    } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.deepEqual(result.errors, []));
  withFixture({
    '../package.json': JSON.stringify({ scripts: {
      prebuild: 'vite build -c hidden.vite.config.ts',
      build: 'vite build',
    } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    '../hidden.vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('exact delegated boundary checks are accepted for the supported names', () => {
  for (const name of ['arch', 'check:arch', 'test:architecture']) withFixture({
    '../package.json': JSON.stringify({ scripts: {
      build: 'npm run ' + name + ' && vite build',
      [name]: 'node ../../tools/check-boundaries.cjs src',
    } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.deepEqual(result.errors, []));
});

test('CommonJS module.require cannot cross from shared code into module internals', () => {
  for (const loader of [
    'module.require("../../modules/orders/ui/private.cjs")',
    'module["require"]("../../modules/orders/ui/private.cjs")',
    "module['require']('../../modules/orders/ui/private.cjs')",
  ]) withFixture({
    'shared/lib/bridge.cjs': 'module.exports = ' + loader + ';',
    'modules/orders/ui/private.cjs': 'module.exports = { private: true };',
  }, result => assert.match(result.errors.join(' '), /shared-must-be-independent/));
});

test('module.require creates runtime edges for CommonJS cycles', () => withFixture({
  'modules/orders/infrastructure/a.cjs': 'module.exports = module.require("./b.cjs");',
  'modules/orders/infrastructure/b.cjs': 'module.exports = module.require("./a.cjs");',
}, result => assert.match(result.errors.join(' '), /runtime-cycle/)));

test('computed, nonliteral and detached module require cannot bypass the graph', () => {
  const loaders = [
    ['module[operation]("./target.cjs")', /unsupported-computed-module-loader/],
    ['module.require(target)', /unsupported-dynamic-require/],
    ['module["require"](target)', /unsupported-dynamic-require/],
    ['const loader = module.require; loader("./target.cjs")', /unsupported-indirect-module-require/],
    ['module.require.call(module, "./target.cjs")', /unsupported-indirect-module-require/],
    ['const { require: load } = module; load("./target.cjs")', /unsupported-indirect-module-require/],
    ['require.call(null, "./target.cjs")', /unsupported-indirect-require/],
  ];
  for (const [content, error] of loaders) withFixture({
    'modules/orders/infrastructure/loader.cjs': content,
    'modules/orders/infrastructure/target.cjs': 'module.exports = {};',
  }, result => assert.match(result.errors.join(' '), error));
});

test('Node createRequire factories cannot hide arbitrary CommonJS load edges', () => {
  const statements = [
    'import { createRequire } from "node:module"; const load = createRequire(import.meta.url);',
    'import { createRequire as makeRequire } from "module"; const load = makeRequire(import.meta.url);',
    'import * as loader from "node:module"; const load = loader.createRequire(import.meta.url);',
    'const mod = require("node:module"); const load = mod.createRequire(__filename);',
    'const load = require("module").createRequire(__filename);',
  ];
  for (const src of statements) withFixture({
    'modules/orders/infrastructure/loader.mjs': src,
  }, result => assert.match(result.errors.join(' '), /unsupported-node-create-require/));
});

test('ordinary literal CommonJS module.require dependencies remain supported', () => withFixture({
  'modules/orders/infrastructure/io.cjs': 'const path = module.require("node:path"); module.exports = path.sep;',
}, result => assert.deepEqual(result.errors, [])));

test('npm verification and test orchestration hooks fail closed on opaque builders', () => {
  for (const [main, hook] of [
    ['verify', 'preverify'], ['verify', 'postverify'],
    ['test', 'pretest'], ['test', 'posttest'],
    ['lint', 'prelint'], ['build:release', 'prebuild:release'],
    ['check:react', 'postcheck:react'],
  ]) withFixture({
    '../package.json': JSON.stringify({ scripts: {
      [main]: 'vite build',
      [hook]: 'node scripts/hidden-build.mjs',
    } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('inert npm verification hooks remain compatible with explicit Vite scripts', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    preverify: 'tsc --noEmit',
    verify: 'npm run build',
    postverify: 'echo complete',
    build: 'npm run arch && tsc --noEmit && vite build',
    arch: 'node ../../tools/check-boundaries.cjs src',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.deepEqual(result.errors, [])));

test('aliased CommonJS require and module identifiers must fail closed', () => {
  const aliases = [
    'const load = require; module.exports = load("../../modules/orders/ui/private.cjs");',
    'const mod = module; mod.require("../../modules/orders/ui/private.cjs");',
    'let load; load = require; module.exports = load("../../modules/orders/ui/private.cjs");',
    'const f = (loader) => loader("../../modules/orders/ui/private.cjs"); module.exports = f(require);',
    'function wrap(module) { return module.require("../../modules/orders/ui/private.cjs"); }',
    'const load = (require); load("../../modules/orders/ui/private.cjs");',
    'const { require: load } = module; load("../../modules/orders/ui/private.cjs");',
  ];
  for (const source of aliases) withFixture({
    'shared/lib/bridge.cjs': source,
    'modules/orders/ui/private.cjs': 'module.exports = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-indirect-commonjs-loader|unsupported-indirect-module-require/));
});

test('valid direct CommonJS loaders and module.exports remain supported', () => withFixture({
  'modules/orders/infrastructure/bridge.cjs': 'const path = require("node:path"); module.exports = module.require("./impl.cjs");',
  'modules/orders/infrastructure/impl.cjs': 'module.exports = require("node:os").platform();',
}, result => assert.deepEqual(result.errors, [])));

test('opaque main verify and test scripts cannot hide Vite builders', () => {
  for (const [name,cmd] of [
    ['verify', 'node scripts/hidden-build.mjs'],
    ['test', 'tsx scripts/hidden-build.ts'],
    ['verify', 'npm run hidden'],
    ['test', 'npm run nested'],
    ['check:react', 'node scripts/build.cjs'],
  ]) withFixture({
    '../package.json': JSON.stringify({ scripts: {
      [name]: cmd,
      hidden: 'node scripts/hidden-build.mjs',
      nested: 'npm run hidden',
      build: 'vite build',
    } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('npm script reachability includes hooks on a deeply delegated target', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    verify: 'npm run validate && npm run build',
    validate: 'npm run lint',
    lint: 'eslint src',
    prelint: 'node scripts/hidden-build.mjs',
    build: 'vite build',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('npm script recursion detects cycles before trusting configuration', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    verify: 'npm run test',
    test: 'npm run verify',
    build: 'vite build',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /cyclic npm script delegation/)));

test('safe npm verify/test script graph remains supported', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    verify: 'npm run lint && npm test && npm run build',
    lint: 'eslint src',
    test: 'vitest run',
    build: 'npm run arch && tsc --noEmit && vite build',
    arch: 'node ../../tools/check-boundaries.cjs src',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.deepEqual(result.errors, [])));

test('safe Node test and test lifecycle tools are allowed', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    pretest: 'tsc --noEmit',
    test: 'node --test tests/*.test.mjs',
    build: 'vite build',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.deepEqual(result.errors, [])));

test('deprecated process.mainModule loaders cannot bypass ownership checks', () => {
  for (const loader of [
    'process.mainModule.require("../../modules/orders/ui/private.cjs")',
    'process["mainModule"].require("../../modules/orders/ui/private.cjs")',
    "const main = process.mainModule; main.require('../../modules/orders/ui/private.cjs')",
  ]) withFixture({
    'shared/lib/bridge.cjs': 'module.exports = ' + loader + ';',
    'modules/orders/ui/private.cjs': 'module.exports = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-node-mainmodule-loader/));
});

test('npm script argument forwarding cannot change the selected Vite config', () => {
  for (const verify of [
    'npm run build -- --config hidden.vite.config.ts',
    'npm run build -- -c hidden.vite.config.ts',
    'npm run build -- --mode staging',
    'npm run build -- --config=hidden.vite.config.ts',
    'npm test -- --config hidden.vite.config.ts',
  ]) withFixture({
    '../package.json': JSON.stringify({ scripts: {
      verify,
      test: 'npm run build',
      build: 'vite build',
    } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    '../hidden.vite.config.ts': 'export default { resolve: { alias: { "@private": "/src/modules/orders/ui" } } };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('npm workspace/prefix flags cannot select an unverified package build', () => {
  for (const verify of [
    'npm run build --workspace other',
    'npm run build -w other',
    'npm run build --prefix packages/other',
    'npm --workspace other run build',
    'npm --prefix packages/other run build',
    'pnpm --filter other run build',
    'yarn workspace other run build',
  ]) withFixture({
    '../package.json': JSON.stringify({ scripts: { verify, build: 'vite build' } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('nested npm argument forwarding remains unsupported', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    verify: 'npm run test',
    test: 'npm run build -- --config hidden.vite.config.ts',
    build: 'vite build',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/)));

test('ordinary unmodified npm build delegation remains supported', () => withFixture({
  '../package.json': JSON.stringify({ scripts: {
    verify: 'npm run lint && npm test && npm run build',
    lint: 'eslint src',
    test: 'vitest run',
    build: 'npm run arch && tsc --noEmit && vite build',
    arch: 'node ../../tools/check-boundaries.cjs src',
  } }),
  '../vite.config.ts': 'export default { plugins: [] };',
  'app/start.ts': 'export const start = true;',
}, result => assert.deepEqual(result.errors, [])));

test('ordinary TypeScript property names named module and require do not imply a loader', () => withFixture({
  'shared/lib/plugin.ts': [
    'export interface PluginInfo { module: string; require: boolean; }',
    'export class PluginState { module = "example"; require = false; }',
    'export type PluginShape = { module: string; require?: boolean };',
    'export function visit(module: string, require: boolean): number { return 1; }',
    'export const plugin = { module: "example", require: true };',
  ].join('\n'),
}, result => assert.deepEqual(result.errors, [])));

test('TypeScript method signatures and enum names are not CommonJS loaders', () => withFixture({
  'shared/lib/plugins.ts': [
    'export interface PluginManager { require(name: string): string; module(): string; }',
    'export class Plugin { require(): string { return "ok"; } module(): string { return "ok"; } }',
    'export enum Action { require = "require", module = "module" }',
  ].join('\n'),
}, result => assert.deepEqual(result.errors, [])));

test('unsafe loader aliases remain rejected', () => {
  for (const code of [
    'const load = require; module.exports = load("./internal.cjs");',
    'const load = module; load.require("./internal.cjs");',
    'const run = () => require; module.exports = run;',
  ]) withFixture({
    'modules/orders/infrastructure/a.cjs': code,
    'modules/orders/infrastructure/internal.cjs': 'module.exports = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-indirect-commonjs-loader/));
});

test('test-runner command injections and executable configuration flags fail closed', () => {
  for (const script of [
    'node --test --import ./scripts/hidden-build.mjs tests/unit.test.cjs',
    'node --test --require ./scripts/hidden-build.cjs tests/unit.test.cjs',
    'node --test --loader ./scripts/loader.mjs tests/unit.test.cjs',
    'node --test --test-reporter ./scripts/reporter.mjs tests/unit.test.cjs',
    'vitest run --config hidden.vite.config.ts',
    'vitest --config hidden.vite.config.ts run',
    'vitest run --setupFiles ./scripts/hidden-build.mjs',
  ]) withFixture({
    '../package.json': JSON.stringify({ scripts: { test: script, build: 'vite build' } }),
    '../vite.config.ts': 'export default { plugins: [] };',
    '../hidden.vite.config.ts': 'export default { plugins: [] };',
    'app/start.ts': 'export const start = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-custom-config/));
});

test('documented narrow Node and Vitest test runner commands remain supported', () => {
  for (const script of ['node --test tests/unit.test.cjs', 'node --test tests/*.test.mjs', 'vitest run']) {
    withFixture({
      '../package.json': JSON.stringify({ scripts: { test: script, build: 'vite build' } }),
      '../vite.config.ts': 'export default { plugins: [] };',
      'app/start.ts': 'export const start = true;',
    }, result => assert.deepEqual(result.errors, []));
  }
});

test('destructured domain properties called module and require remain ordinary data', () => withFixture({
  'shared/lib/destructure.ts': [
    'const config = { module: "catalog", require: true };',
    'const { module: moduleName, require: needed } = config;',
    'export const description = moduleName + String(needed);',
  ].join('\n'),
}, result => assert.deepEqual(result.errors, [])));

test('typed local module and require parameters remain accessible inside their functions', () => withFixture({
  'shared/lib/local-names.ts': [
    'export function label(module: string): string { return module.toUpperCase(); }',
    'export function enabled(require: boolean): boolean { return !require; }',
    'export function combine(module: string, require: boolean) {',
    '  return module + String(require);',
    '}',
    'export function description() { const module = "catalog"; return module.toUpperCase(); }',
  ].join('\n'),
}, result => assert.deepEqual(result.errors, [])));

test('unsafe runtime loader aliases are still rejected with typed names supported', () => {
  for (const statement of [
    'const loader = require; module.exports = loader("./private.cjs");',
    'const loader = module; loader.require("./private.cjs");',
    'const passed = (loader) => loader("./private.cjs"); passed(require);',
  ]) withFixture({
    'modules/orders/infrastructure/unsafe.cjs': statement,
    'modules/orders/infrastructure/private.cjs': 'module.exports = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-indirect-commonjs-loader/));
});

test('a local untyped loader binding cannot borrow safety from an outer primitive binding', () => withFixture({
  'shared/lib/shadowed.ts': [
    'const module = "harmless";',
    'export function inspect(module: unknown) { return module; }',
  ].join('\n'),
}, result => assert.match(result.errors.join(' '), /unsupported-indirect-commonjs-loader/)));

test('typed local primitive bindings permit domain vocabulary without allowing bare loader references', () => withFixture({
  'shared/lib/typed-local.ts': [
    'const module: string = "catalog";',
    'const require: boolean = false;',
    'export const details = module.toUpperCase() + String(require);',
  ].join('\n'),
}, result => assert.deepEqual(result.errors, [])));

test('Vite plugins cannot silently change statically inspected aliases', () => {
  for (const plugin of [
    "{ name: 'override', config() { return { resolve: { alias: { '@safe': '/elsewhere' } } }; } }",
    'react()',
    'unknownPlugin',
  ]) withFixture({
    '../vite.config.ts': 'import { fileURLToPath } from "node:url"; export default { resolve: { alias: { "@safe": fileURLToPath(new URL("./src/shared/lib/safe.ts", import.meta.url)) } }, plugins: [' + plugin + '] };',
    '../architecture.config.json': JSON.stringify({ viteAliases: { '@safe': 'src/shared/lib/safe.ts' } }),
    'shared/lib/safe.ts': 'export const x = 1;',
  }, result => assert.match(result.errors.join(' '), /unverifiable-vite-plugin-alias/));
});

test('empty plugin array does not block an otherwise valid alias map', () => withFixture({
  '../vite.config.ts': 'import { fileURLToPath } from "node:url"; export default { resolve: { alias: { "@safe": fileURLToPath(new URL("./src/shared/lib/safe.ts", import.meta.url)) } }, plugins: [] };',
  '../architecture.config.json': JSON.stringify({ viteAliases: { '@safe': 'src/shared/lib/safe.ts' } }),
  'shared/lib/safe.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('escaped CSS identifiers cannot bypass complete ownership enforcement', () => {
  for (const css of ["@im\\70ort \"../../modules/orders/ui/private.css\";",".widget { background: u\\72l(\"../../modules/orders/ui/private.svg\"); }"]) withFixture({
    'shared/ui/panel.css': css,
    'modules/orders/ui/private.css': '.private { color: red }',
    'modules/orders/ui/private.svg': '<svg/>',
    'shared/ui/view.ts': 'import "./panel.css"; export const view = true;',
  }, result => assert.match(result.errors.join(' '), /unsupported-css-escaped-identifier/));
});

test('root verify includes orders architecture check', () => {
  const rootManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(rootManifest.scripts['check:orders'], 'node tools/check-boundaries.cjs examples/orders/src');
  assert.match(rootManifest.scripts.verify, /npm run check:orders/);
});

test('plugin-added aliases fail even when no static alias map exists', () => {
  for (const plugins of [
    "[{ name: 'inject', config() { return { resolve: { alias: { '@orders': '/elsewhere' } } }; } }]",
    '[untrustedPlugin()]',
    'getPlugins()',
  ]) withFixture({
    '../vite.config.ts': 'export default { plugins: ' + plugins + ' };',
    'shared/ui/view.ts': 'import value from "@orders/private"; export const view = value;',
    'modules/orders/ui/private.ts': 'export const secret = true;',
  }, result => assert.match(result.errors.join(' '), /unverifiable-vite-plugin-alias/));
});

test('pinned unconfigured React Fast Refresh plugin is a narrow exception', () => withFixture({
  '../vite.config.ts': 'import react from "@vitejs/plugin-react"; export default { plugins: [react()] };',
  '../package.json': JSON.stringify({ devDependencies: { '@vitejs/plugin-react': '4.7.0' } }),
  'app/start.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('React plugin exception refuses changed versions, options, imports and extra plugins', () => {
  const cfg = 'import react from "@vitejs/plugin-react"; export default { plugins: [react()] };';
  for (const [config, manifest] of [
    [cfg, { devDependencies: { '@vitejs/plugin-react': '^4.7.0' } }],
    [cfg.replace('react()', 'react({})'), { devDependencies: { '@vitejs/plugin-react': '4.7.0' } }],
    [cfg.replace('[react()]', '[react(), injected()]'), { devDependencies: { '@vitejs/plugin-react': '4.7.0' } }],
    [cfg.replace('import react from "@vitejs/plugin-react"', 'import react from "./unsafe"'), { devDependencies: { '@vitejs/plugin-react': '4.7.0' } }],
  ]) withFixture({
    '../vite.config.ts': config,
    '../package.json': JSON.stringify(manifest),
    'app/start.ts': 'export const x = 1;',
  }, result => assert.match(result.errors.join(' '), /unverifiable-vite-plugin-alias/));
});

test('Vite custom root and bundler entrypoint overrides cannot hide unscanned code', () => {
  for (const body of [
    'root: "../unverified-app"',
    'root: makeRoot()',
    'build: { rollupOptions: { input: "../unverified-app/index.html" } }',
    'build: { lib: { entry: "../unverified-app/index.ts" } }',
    'build: { ssr: "../unverified-app/index.ts" }',
    'environments: { client: { build: { rollupOptions: { input: "../outside.ts" } } } }',
    'builder: customBuilder()',
  ]) withFixture({
    '../vite.config.ts': 'export default { ' + body + ' };',
    'app/start.ts': 'export const x = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-build-entry/));
});

test('default root and empty build block remain within supported static grammar', () => withFixture({
  '../vite.config.ts': 'export default { root: ".", build: {}, plugins: [] };',
  'app/start.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('Vite default HTML entrypoints cannot load unverified files or inline modules', () => {
  for (const [name, html] of [["outside JS","<script type=\"module\" src=\"/other/main.ts\"></script>"],["inline JS","<script type=\"module\">import \"../other/main.ts\"</script>"],["outside style","<link rel=\"stylesheet\" href=\"/other/styles.css\">"],["classic script","<script src=\"/src/main.ts\"></script>"]]) withFixture({
    '../vite.config.ts': 'export default { plugins: [] };',
    '../index.html': html,
    '../other/main.ts': 'export const main = true;',
    '../other/styles.css': '.x {}',
    'app/start.ts': 'export const x = 1;',
  }, result => assert.match(result.errors.join(' '), /unsupported-vite-html-entry/, name));
});
test('Vite default HTML entries inside scanned source remain supported', () => withFixture({
  '../vite.config.ts': 'export default { plugins: [] };',
  '../index.html': '<!doctype html><script type="module" src="/src/app/start.ts"></script>',
  'app/start.ts': 'export const x = 1;',
}, result => assert.deepEqual(result.errors, [])));

test('default Vite HTML entry cannot bypass checking even without vite.config', () => withFixture({
  '../index.html': '<script type="module" src="/outside/main.ts"></script>',
  '../outside/main.ts': 'export const x = 1;',
  'app/start.ts': 'export const x = 1;',
}, result => assert.match(result.errors.join(' '), /unsupported-vite-html-entry/)));

test('Vite post-source JS/Sass dependency injection never receives static source-graph approval', () => {
  for (const setting of [
    'esbuild: { jsxInject: "import \'../../modules/orders/ui/private.ts\';" }',
    'css: { preprocessorOptions: { scss: { additionalData: "@use \'../../modules/orders/ui/private.scss\';" } } }',
    'esbuild: makeEsbuildOptions()',
    'css: makeStyleOptions()',
    'css: { modules: { generateScopedName: "x" } }',
  ]) withFixture({
    '../vite.config.ts': 'export default { plugins: [], ' + setting + ' };',
    'shared/ui/component.tsx': 'export const View = () => null;',
    'modules/orders/ui/private.ts': 'export const secret = true;',
  }, result => assert.match(result.errors.join(' '), /unverifiable-vite-transforms/, setting));
});

test('empty transform options and explicitly disabled esbuild remain safe static configurations', () => {
  for (const setting of ['esbuild: {}, css: {}', 'esbuild: false']) withFixture({
    '../vite.config.ts': 'export default { plugins: [], ' + setting + ' };',
    'app/start.ts': 'export const value = true;',
  }, result => assert.deepEqual(result.errors, []));
});

test('HTML event handlers, inline styles and executable URLs fail closed', () => {
  for (const [name, html] of [["onload","<script type=\"module\" src=\"/src/app/start.ts\" onload=\"import('/src/modules/orders/ui/private.ts')\"></script>"],["onerror","<img onerror=\"import('/src/modules/orders/ui/private.ts')\"><script type=\"module\" src=\"/src/app/start.ts\"></script>"],["onclick","<button onclick=\"import('/src/modules/orders/ui/private.ts')\">Click</button><script type=\"module\" src=\"/src/app/start.ts\"></script>"],["quoted greater-than","<button data-example=\"a > b\" onpointerdown=\"import('/src/modules/orders/ui/private.ts')\">Click</button>"],["inline CSS import","<style>@import url(\"/src/modules/orders/ui/private.css\");</style><script type=\"module\" src=\"/src/app/start.ts\"></script>"],["inline CSS URL","<style>.x{background:url(\"/src/modules/orders/ui/private.css\")}</style>"],["CSS style attribute","<div style=\"background:url('/src/modules/orders/ui/private.css')\"></div>"],["javascript URL","<a href=\"javascript:import('/src/modules/orders/ui/private.ts')\">Click</a>"],["encoded javascript","<a href=\"java&#x73;cript:alert(1)\">Click</a>"],["srcdoc","<iframe srcdoc=\"<script>import('/src/private.ts')</script>\"></iframe>"],["import map","<script type=\"importmap\">{\"imports\":{\"x\":\"/src/modules/orders/ui/private.ts\"}}</script>"],["meta refresh","<meta http-equiv=\"refresh\" content=\"0;url=javascript:alert(1)\">"],["inline stylesheet attribute","<p STYLE=\"color:red\">hello</p>"]]) withFixture({
    '../index.html': html,
    'app/start.ts': 'export const start = true;',
    'app/base.css': 'body { color: black; }',
    'modules/orders/ui/private.ts': 'export const privateValue = true;',
    'modules/orders/ui/private.css': '.private { color: red; }',
  }, result => assert.match(result.errors.join(' '),
    /unsupported-vite-html-(?:entry|inline)/, name));
});

test('ordinary HTML attributes, inert scripts and checked stylesheet entries remain valid', () => {
  for (const html of ["<div data-example=\"x > y\" aria-label=\"Hello\">Hello</div><script type=\"module\" src=\"/src/app/start.ts\"></script>","<!-- <style>@import url(\"evil.css\");</style> --><script type=\"module\" src=\"/src/app/start.ts\"></script>","<link rel=\"stylesheet\" href=\"/src/app/base.css\"><script type=\"application/json\">{\"hello\":\"world\"}</script><script type=\"module\" src=\"/src/app/start.ts\"></script>","<div data-label=\"onerror=not-an-attribute\"></div><script type=\"module\" src=\"/src/app/start.ts\"></script>"]) withFixture({
    '../index.html': html,
    'app/start.ts': 'export const start = true;',
    'app/base.css': 'body { color: black; }',
  }, result => assert.deepEqual(result.errors, []));
});
