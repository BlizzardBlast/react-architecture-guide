# React reference application

This educational client-only Vite application illustrates the [architecture guide](../../docs/architecture.md) with React, TypeScript, TanStack Router and TanStack Query.

`src/modules/catalog/` is intentionally simple (`api/model/ui`). `src/modules/orders/` is more complex (`domain/application/infrastructure/ui`) with a module-local composition factory and consuming-layer repository/event contracts. `src/routes/` composes the two features, and `src/app/` configures the router and providers. Pure shared analytics transport is implemented separately from the domain-specific Order analytics adapter.

## Running and verification

Requires Node 22.13+ within Node 22, or Node 24+, and npm registry access. From `examples/react-app`, install the root checker dependencies as well as the example:

```sh
npm --prefix ../.. ci
npm ci
npm run verify
npm audit
npm run dev
```

The committed lockfile supports `npm ci`. Clean installation, lint, all 21 React tests, architecture checks, typechecking, production/repeat builds, audit and a bounded browser smoke test passed on 2026-10-26. See [verification evidence and limits](../../docs/verification.md).

`npm run verify` runs ESLint (React Hooks, TypeScript and JSX accessibility), Vitest, architecture checks, TypeScript typechecking and the Vite build. The architecture checker accepts Vite-style CSS/image/query assets within owned presentation code, checks static URL/worker and transitive stylesheet dependencies (including intra-module layer rules, CSS url()/image-set() and literal Less import options), rejects unsupported dynamic imports and Vite globs, and checks source and owned JSON dependencies separately.

## Catalog behavior

The catalog displays distinct loading, error/retry, empty and success states. Its heading uses React `useId` to avoid duplicate DOM IDs when the component is rendered more than once. Tests exercise each state through a controlled data-source mock. This feature remains a simple `api/model/ui` module; the orders feature uses complex layering.

## Checkout behavior

The checkout uses structured field validation, unique accessible IDs (`useId`), and a TanStack Query cache key scoped to the injected Orders service. Changing the selected product remounts the form to clear outdated feedback; the non-keyed wrapper holds an in-flight save guard so the user cannot edit or resubmit while an earlier save is pending. Failed saves release the guard for retry. A failed request's error is stored in the persistent checkout wrapper, so its failure is still announced if the product changes during the pending operation.

**Important:** The orders repository is **in memory**, so data disappears on refresh. There is no backend authorization, persistence or server-side idempotency. The single-flight guard only protects one mounted client UI and is not an example of secure payment/order processing. Real applications require server validation, authorization, idempotent order creation and appropriately scoped caches; SSR frameworks also need request-scoped services and Query clients.

## Build output and repeat builds

`npm run build` executes the architecture checker, TypeScript check and Vite build, writing output to `../../.vite-build/react-app` (relative to this directory). This location is intentionally **outside the Vite dev project's root**; Vite's default `dist/index.html` would otherwise be found on the next architecture run and rejected as an unverified dev-served secondary HTML page. Use `npm run preview` to serve the same built output. The `.vite-build/` directory is ignored by Git, and `--emptyOutDir` removes stale files before each build.

This does **not** relax the checker's rule against unexpected `dist/` or `build/` HTML inside the app project root. Two consecutive builds and dev/preview entry, asset and route HTTP responses were verified; custom plugin/worker graphs still require separate conformance testing.
