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
