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
  assert.match(result.errors.join(' '), /unresolved import/);
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
  assert.match(result.errors.join(' '), /pure-layer-imports-shared-infrastructure/);
}));
