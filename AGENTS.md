# Agent instructions — React Architecture Guide

This repository documents a **pragmatic modular/feature-first React architecture**. Read [`docs/architecture.md`](docs/architecture.md), [`docs/dependency-rules.md`](docs/dependency-rules.md), and the relevant ADR before changing any implementation, checker rule or example.

## Architecture and SOLID

- Own business behavior inside a cohesive `src/modules/<capability>/`. The default is simple `api/model/ui`; optional complex mode is `domain/application/infrastructure/ui`. Don't mix layouts or add empty folders to satisfy a template.
- Use route/app composition for sibling module interactions. Allow one-way dependencies only when explicitly reviewed in `architecture.config.json`, through destination public `index.*` files. The checker rejects cross-module cycles, including type-only ones.
- `shared/` never imports business modules, routes or application composition (including assets and types). `domain/`, `model/`, `application/`, `shared/lib/` and `shared/domain/` may depend only on their appropriate pure code and reviewed external pure packages, not UI, HTTP, generated DTOs or presentation assets.
- Module internals never import their own barrel. External consumers use narrow public APIs; prefer type-only imports when no runtime dependency is required.
- Favor consuming-layer ports, ordinary function arguments/props and small factories over unconditional repositories, inheritance or global DI frameworks.
- Do not treat all modules as DDD bounded contexts or claim full Feature-Sliced Design compliance.

## React and application correctness

- Follow React's rules of hooks and the project's React/Compiler/router version; do not add blanket memoization.
- Keep render functions pure. Effects synchronize with external systems, not ordinary derived state.
- Validate untrusted server data at boundaries and enforce sensitive authorization server-side.
- Query cache keys must include data ownership/source scope. Handle pending, empty, error, retry and success paths. Resetting a TanStack mutation observer does not cancel an in-flight request.
- Use semantic accessible markup, stable field associations with `useId`, structured validation errors, and user-observable behavior tests.
- The reference checkout prevents overlapping saves in one mounted UI, but production orders also need server-side authorization and idempotency.

## Checker and testing

The AST checker supports JS, JSX, MJS, CJS, TS, TSX, MTS, CTS, declaration files, import-equals, literal imports/re-exports and TypeScript path aliases. It checks physical source-file symlink ownership and module-layout consistency; `allowMixedLayouts` requires a documented migration justification and never permits cross-mode imports. It explicitly rejects `import.meta.glob` and nonliteral dynamic imports until expansion can be audited; it checks local `new URL(..., import.meta.url)` and Vite worker entrypoints; supports root-absolute Vite imports and query-modified assets, and checks Vite aliases against an explicit `viteAliases` map with inspectable matching targets. Object prototype properties never act as migration exemptions. It enforces import ownership for source and local static assets, including JSON. Its limitations are in [the milestone documentation](docs/implementation-milestone.md); do not claim that it proves semantic SOLID compliance.

```sh
npm ci
npm --prefix examples/orders ci
npm --prefix examples/react-app ci
npm run verify
npm audit
npm --prefix examples/orders audit
npm --prefix examples/react-app audit
```

The React example also runs ESLint's maintained React Hooks, JSX accessibility and TypeScript rules through its `verify` script. Install dependencies and generate trustworthy registry-backed lockfiles before asserting full test coverage or merge readiness. If installation is blocked, report exactly which checks were and were not run.

## GitHub work

Batch review findings, implement one coherent change, validate locally before pushing, and use a draft PR while checks are incomplete. Minimize GitHub Actions consumption **without removing necessary security, quality, or test checks**. Preserve existing code and user changes. Do not merge a draft PR on unverified assumptions.

Instructions here govern this **guide repository only**. To apply the standard elsewhere, adapt the [copy-ready snippet](agents/react-architecture/AGENTS.snippet.md) in that repository; nothing propagates automatically.
