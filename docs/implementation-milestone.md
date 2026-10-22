# Milestone 1 — Executable architecture

This milestone makes the [modular, feature-first standard](architecture.md) demonstrable without imposing a mandatory scaffold or a heavyweight architectural framework.

## What is included

- [`tools/check-boundaries.cjs`](../tools/check-boundaries.cjs): AST-based dependency analysis of JS/TS source, declaration files, literal imports/re-exports, import-equals, require/dynamic import, and TypeScript path aliases. It checks module ownership, public APIs, shared purity, layered imports, cycles, static asset/JSON ownership, and transitive CSS/Sass/Less imports, URL and quoted image-set() ownership with the same layer-direction checks as source code.
- [`tools/check-boundaries.test.cjs`](../tools/check-boundaries.test.cjs): positive and negative fixtures for the above boundaries, including pure-layer dependencies, module modes and migrations, source symlinks, shared code, JavaScript public APIs and local assets.
- [`tools/validate-docs.cjs`](../tools/validate-docs.cjs) and [its tests](../tools/validate-docs.test.cjs): Markdown code-fence and local-link validation.
- [React reference app](../examples/react-app/README.md): Vite, React, TanStack Router/Query, simple catalog (including loading/error/empty/retry states) and layered orders capabilities, in-memory persistence, and service-specific Query keys. Checkout has structured validation, accessible labels, a shared in-flight guard and deferred-promise retry tests.
- [TypeScript orders example](../examples/orders/README.md): dependency inversion with application-owned ports.
- [Agent instructions](../agents/react-architecture/AGENTS.snippet.md): a copy-ready guide for consumer repositories.

## How to validate

Requires Node, a working npm registry and authentic package lockfiles in the root, `examples/orders` and `examples/react-app`. Once lockfiles exist:

```sh
npm ci
npm --prefix examples/orders ci
npm --prefix examples/react-app ci
npm run verify
npm audit
npm --prefix examples/orders audit
npm --prefix examples/react-app audit
```

`npm run verify` runs Markdown tests, architecture fixtures, TypeScript orders checks, and the React app's ESLint React Hooks/JSX accessibility checks, tests, boundary check, typecheck and Vite production build. Browser smoke tests should also cover navigation, accessible form validation, pending saves, failed saves, retry, and product switches.

**Verification status for PR #1:** The authoring environment cannot resolve the npm registry. An authentic lockfile, clean install, full architecture suite, React/Vite/Vitest run and transitive vulnerability audit remain pending. Static source and Markdown inspection do **not** establish their success. Keep the PR in draft until these checks run successfully; do not fabricate dependency metadata.

## Boundaries and limitations

The checker reads the consuming project's `tsconfig.json` and optionally `architecture.config.json`. Vite glob calls and computed dynamic imports fail closed; local worker and asset URLs are checked against source ownership; Vite asset query suffixes are separated from physical filenames; Vite aliases must be mirrored as inspectable, matching paths in `viteAliases` without trailing-slash alias keys, and root-absolute imports are treated as owned project imports. It accepts owned JSON configuration imports; pure layers cannot import presentation assets. Source-file symlinks are checked against canonical physical paths, and modules mixing simple/complex layer modes require a justified `allowMixedLayouts` migration exception. Paths resolving outside the scanned `src/` are reported as unverified rather than silently accepted. Read [dependency rules](dependency-rules.md) for approved external pure packages and one-way module API exceptions.

Unverifiable computed imports are rejected, but arbitrary plugin-injected aliases, advanced transformations and semantic use of ambient globals cannot be proved by this static analysis. The checker is not a security sandbox or replacement for a compiler, exhaustive dependency analyzer, browser validation, supply-chain audit, or backend authorization.

The React app stores orders in memory and performs UI-level single-flight guarding only. **Real order creation requires trusted server validation, authorization and idempotency.** For SSR, instantiate services and Query clients with request-appropriate scope.

No additional GitHub Actions workflows were added solely for this guide. Existing consumers should integrate necessary architecture rules into their established local/CI gates, batching changes and checks to conserve Actions minutes.
