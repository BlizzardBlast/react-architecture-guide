# Runnable React reference application

A deliberately small **Vite + React + TypeScript + TanStack Router + TanStack Query** example illustrating both supported module shapes.

- `catalog/`: simple `api/model/ui` module with an asynchronous query and accessible loading/error/selection states.
- `orders/`: complex `domain/application/infrastructure/ui` module with domain validation, a small repository port, an in-memory adapter, domain-owned analytics and a composition factory.
- `routes/home.tsx`: combines the independent modules **without sibling-module imports**.
- `app/router.tsx`: constructs providers/services and configures client-side routing; nothing imports app setup back from the route tree.

No real backend is used. Order data is in memory and disappears on reload. This is **not** an example of backend authorization or durable persistence.

## Run (requires registry access)

Requires Node >=22.12.

```sh
npm install
npm run dev
npm run typecheck
npm run arch
npm test
npm run build
```

Install versions are pinned directly in `package.json`, but transitive versions are **not frozen without a lockfile**. Generate and commit a lockfile on a network-enabled machine before relying on `npm ci` for reproducible installations. React/Router/Query dependencies could not be downloaded in the authoring environment; UI tests and the browser build therefore remain **unverified** until those checks run.

Unit/UI tests use Vitest and Testing Library. The architecture checker is run locally using TypeScript's AST; it is **not** a replacement for a comprehensive production dependency audit.

Router integration follows TanStack's recommended router-context QueryClient pattern, including `defaultPreloadStaleTime: 0`. For SSR, services and query clients must be request-scoped.
