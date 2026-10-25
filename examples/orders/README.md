# TypeScript orders example (SOLID and dependency inversion)

This is a **testable TypeScript illustration**, not a complete rendered React application. It shows pure domain rules, consumer-owned application ports, concrete transport adapters, domain-specific analytics mapping, and a composition root.

~~~text
src/
├── app/create-orders-app.ts
├── modules/orders/
│   ├── domain/order.ts
│   ├── application/place-order.ts
│   ├── infrastructure/
│   │   ├── http-order-writer.ts
│   │   └── order-analytics.ts
│   ├── composition/create-orders.ts
│   └── index.ts
└── shared/analytics-client.ts
~~~

The `app` composition function wires concrete dependencies. A React route/component can receive its resulting `placeOrder` function via props, or an appropriately scoped provider, without directly importing concrete HTTP adapters.

The shared analytics interface intentionally knows **nothing about Order**. Only the orders adapter maps business fields to the transport event.

## Run locally

~~~bash
npm ci
npm test
~~~

Requires a Node.js version supporting `node --test` and a TypeScript compiler installed via development dependencies. No live endpoint or network is invoked by the tests (only installation may need network).

See [Architecture](../../docs/architecture.md), [SOLID](../../docs/solid-in-react.md) and [ADR 0002](../../docs/decisions/0002-optional-clean-layers.md).
