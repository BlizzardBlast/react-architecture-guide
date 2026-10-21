# Instructions for coding agents

This repository defines a React architecture standard; don't convert it into a large application starter without explicit instruction. Read [README.md](README.md) and [architecture](docs/architecture.md) before changing architecture.

## Ownership and dependencies

- The primary unit is `src/modules/<business-capability>/`. A module is not automatically a DDD bounded context.
- `shared/` **must never** import `modules/`, `routes/` or `app/`, including type-only imports.
- Sibling modules have no direct imports by default. Compose cross-module workflows at a route/app integration boundary. Any approved exception requires a documented, acyclic public contract.
- Outside consumers import a module's deliberate `index.ts` public API. Internal code imports its implementation files directly, never through its own barrel.
- Simple module: `model/` pure rules, `api/` transport and server-state helpers, `ui/` React components and hooks.
- Complex module: replace simple mode with `domain/`, `application/`, `infrastructure/`, `ui/` when business complexity warrants it.
- Domain has no React, fetch, browser, infrastructure, or generated DTO dependencies. Application use cases depend on domain and small consumed ports. Infrastructure implements ports. UI has no dependency on concrete adapters in complex mode.
- Define interfaces where consumed (usually application), not because every concrete service "needs an interface."
- Domain-specific analytics, notification formatting, route and permission mapping belongs in its owning module; generic transport remains business-agnostic.
- Runtime cycles are forbidden. Investigate type-only cycles as conceptual coupling, not necessarily runtime failures.
- Runtime-validate untrusted API responses. Frontend checks are never a substitute for trusted-server validation and authorization.

## React-specific practice

- Use local state by default; derive rather than synchronize duplicative state.
- Use Effects only for synchronization with external systems. Keep React-dependent hooks in UI-facing code.
- Coordinate router loaders and server-state caches; query keys must reflect every input that changes data identity, including relevant tenant/user/source scope.
- Use semantic, accessible components and write tests for observable behavior.
- Do not insist on `useMemo` or `useCallback` everywhere; check compiler setup and measure.

## Working safely and efficiently

- Identify ownership, dependencies, and framework conventions before adding files.
- Implement and review coherent batches. Run local formatting, tests, typechecks and architecture checks before pushing.
- Avoid small, repeated commits/pushes that trigger GitHub Actions. Draft PRs may be useful for complex iteration; do not omit required quality or security checks.
- For changes here: `python3 scripts/validate_docs.py` and `cd examples/orders && npm test`.
- Update decision records if the guidance itself changes; identify external-source facts separately from recommendations.
- Do not claim a check passed unless it actually ran.

## Review questions

Does this feature own the new logic? Are import directions acyclic? Is `shared` generic? Are interfaces or new layers justified? Does pure business code remain pure? Are API responses validated? Are React Effects, cache keys, accessible UI and tests correct? Has work been locally validated and remote pushes batched?

## Milestone 1 implementation

The new [boundary checker](tools/check-boundaries.cjs) enforces critical rules against TypeScript import graphs. In this repository run `node --test tools/check-boundaries.test.cjs` and `node tools/check-boundaries.cjs examples/react-app/src`. The [React reference app](examples/react-app/README.md) demonstrates the rules; when deps are installed, run its typecheck, tests and build.

When applying these rules to a different repository, adapt [the copy-ready instructions](agents/react-architecture/AGENTS.snippet.md), don't assume this repository's AGENTS.md propagates automatically. Do not claim the React example is built or UI-tested until npm dependencies are available and checks have actually passed.

## Findings remediation and package integrity

Use `npm run verify` after dependencies are installed, and run `python3 scripts/validate_docs.py`. The checker examines third-party imports in pure domain/model files (test files excepted); explicitly allow trusted pure packages in the per-project `architecture.config.json` rather than silently bypassing the boundary. Reviewed module-to-module imports must use public APIs and explicit `allowCrossModule` entries; cycles remain forbidden.

The React app is pinned to security-patched Vite/Vitest versions. Until a real npm lockfile is generated and build/tests/audit pass, do not mark PR #1 merge-ready.

