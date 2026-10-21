# React reference application

This educational client-only Vite application illustrates the [architecture guide](../../docs/architecture.md) with React, TypeScript, TanStack Router and TanStack Query.

`src/modules/catalog/` is intentionally simple (`api/model/ui`). `src/modules/orders/` is more complex (`domain/application/infrastructure/ui`) with a module-local composition factory and consuming-layer repository/event contracts. `src/routes/` composes the two features, and `src/app/` configures the router and providers. Pure shared analytics transport is implemented separately from the domain-specific Order analytics adapter.

## Running and verification

Requires Node >=22.12 and npm registry access:

```sh
npm ci
npm run dev
npm run verify
npm audit
```

Generate and commit an authentic `package-lock.json` with `npm install --package-lock-only --ignore-scripts` before relying on `npm ci`. This branch does **not** yet include verified dependency lockfiles, build/typecheck/audit results, or browser smoke-test results because the authoring environment cannot reach the npm registry.

`npm run verify` runs Vitest, architecture checks, TypeScript typechecking and the Vite build. The architecture checker accepts Vite-style CSS/image assets within owned presentation code, and checks source and owned JSON dependencies separately.

## Checkout behavior

The checkout uses structured field validation, unique accessible IDs (`useId`), and a TanStack Query cache key scoped to the injected Orders service. Changing the selected product remounts the form to clear outdated feedback; the non-keyed wrapper holds an in-flight save guard so the user cannot edit or resubmit while an earlier save is pending. Failed saves release the guard for retry.

**Important:** The orders repository is **in memory**, so data disappears on refresh. There is no backend authorization, persistence or server-side idempotency. The single-flight guard only protects one mounted client UI and is not an example of secure payment/order processing. Real applications require server validation, authorization, idempotent order creation and appropriately scoped caches; SSR frameworks also need request-scoped services and Query clients.
