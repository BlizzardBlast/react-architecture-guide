import assert from "node:assert/strict";
import test from "node:test";
import { createPlaceOrder } from "../dist/modules/orders/application/place-order.js";
import { createHttpOrderWriter } from "../dist/modules/orders/infrastructure/http-order-writer.js";
import { createOrderAnalytics } from "../dist/modules/orders/infrastructure/order-analytics.js";

test("valid order persists and emits event", async () => {
  const writes = [];
  const events = [];
  const placeOrder = createPlaceOrder(
    { async create(draft) { writes.push(draft); return { orderId: "o-1" }; } },
    { orderPlaced(receipt, draft) { events.push({ receipt, draft }); } },
  );
  const draft = { customerId: "c-1", totalCents: 1250 };
  assert.deepEqual(await placeOrder(draft), { orderId: "o-1" });
  assert.deepEqual(writes, [draft]);
  assert.equal(events.length, 1);
});

test("invalid order does not write", async () => {
  let writes = 0;
  let events = 0;
  const placeOrder = createPlaceOrder(
    { async create() { writes++; return { orderId: "never" }; } },
    { orderPlaced() { events++; } },
  );
  await assert.rejects(placeOrder({ customerId: " ", totalCents: 1 }), /Customer ID/);
  await assert.rejects(placeOrder({ customerId: "c", totalCents: 1.5 }), /positive integer/);
  await assert.rejects(placeOrder({ customerId: "c", totalCents: -1 }), /positive integer/);
  assert.equal(writes, 0);
  assert.equal(events, 0);
});

test("writer failure does not emit success event", async () => {
  let events = 0;
  const placeOrder = createPlaceOrder(
    { async create() { throw new Error("offline"); } },
    { orderPlaced() { events++; } },
  );
  await assert.rejects(placeOrder({ customerId: "c", totalCents: 100 }), /offline/);
  assert.equal(events, 0);
});

test("HTTP adapter handles success, failure and malformed response", async () => {
  const good = createHttpOrderWriter(async (_url, options) => {
    assert.equal(options.method, "POST");
    return { ok: true, json: async () => ({ orderId: "o-1" }) };
  }, "/api");
  assert.deepEqual(await good.create({ customerId: "c", totalCents: 2 }), { orderId: "o-1" });

  const malformed = createHttpOrderWriter(async () => ({
    ok: true, json: async () => ({ orderId: 2 })
  }), "/api");
  await assert.rejects(malformed.create({ customerId: "c", totalCents: 2 }), /Invalid order response/);

  const failed = createHttpOrderWriter(async () => ({ ok: false }), "/api");
  await assert.rejects(failed.create({ customerId: "c", totalCents: 2 }), /Failed to create order/);
});

test("order-owned analytics maps domain to generic telemetry", () => {
  const calls = [];
  const events = createOrderAnalytics({ track(name, props) { calls.push({ name, props }); } });
  events.orderPlaced({ orderId: "o-1" }, { customerId: "c", totalCents: 300 });
  assert.deepEqual(calls, [
    { name: "order_placed", props: { orderId: "o-1", totalCents: 300 } },
  ]);
});

test("best-effort telemetry cannot fail a successful order", async () => {
  const analytics = createOrderAnalytics({ track() { throw new Error("telemetry offline"); } });
  const placeOrder = createPlaceOrder(
    { async create() { return { orderId: "saved" }; } },
    analytics,
  );
  assert.deepEqual(await placeOrder({ customerId: "c", totalCents: 50 }), { orderId: "saved" });
});

test("asynchronous analytics rejection is handled after an order is saved", async () => {
  let rejectDelivery;
  const delivery = new Promise((_resolve, reject) => { rejectDelivery = reject; });
  const calls = [];
  const analytics = createOrderAnalytics({ track(name, props) { calls.push({ name, props }); return delivery; } });
  const placeOrder = createPlaceOrder({ async create() { return { orderId: "saved" }; } }, analytics);
  assert.equal(analytics.orderPlaced({ orderId: "saved" }, { customerId: "c", totalCents: 50 }), delivery);
  assert.deepEqual(await placeOrder({ customerId: "c", totalCents: 50 }), { orderId: "saved" });
  assert.deepEqual(calls, Array(2).fill({ name: "order_placed", props: { orderId: "saved", totalCents: 50 } }));
  rejectDelivery(new Error("telemetry offline"));
  await new Promise(resolve => setTimeout(resolve, 0));
});

test("order notifications cannot fail a committed order", async () => {
  for (const orderPlaced of [
    () => { throw new Error("notification failed"); },
    async () => { throw new Error("notification failed asynchronously"); },
  ]) {
    const placeOrder = createPlaceOrder({ async create() { return { orderId: "saved" }; } }, { orderPlaced });
    assert.deepEqual(await placeOrder({ customerId: "c", totalCents: 50 }), { orderId: "saved" });
  }
  await new Promise(resolve => setTimeout(resolve, 0));
});
