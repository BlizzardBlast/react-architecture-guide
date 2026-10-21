# React Architecture Guide

**A pragmatic, feature-first React + TypeScript architecture based on SOLID, clear ownership, and enforceable dependency boundaries.**

This repository is a **reference standard**, not a required scaffold or a claim of full Feature-Sliced Design (FSD) or Domain-Driven Design (DDD) compliance. Start small. Introduce Clean Architecture layers only when actual business complexity justifies them.

## Recommended starting structure

~~~text
src/
├── app/                    # Providers, router configuration, composition
├── routes/                 # Router-specific routes (when applicable)
├── modules/                # Independent business capabilities
│   └── orders/
│       ├── api/            # Requests / server-state integrations
│       ├── model/          # Pure rules, types and schemas
│       ├── ui/             # React components, hooks, tests
│       └── index.ts        # Narrow public API
├── shared/
│   ├── api/                # Domain-neutral HTTP primitives
│   ├── ui/                 # Domain-neutral UI primitives
│   └── lib/                # Domain-neutral utilities
├── generated/              # Optional generated API clients
├── testing/                # Shared test tools
└── main.tsx
~~~

Do **not** create empty directories just to match this tree. A module owns a business capability and is **not automatically a DDD bounded context**. Treat framework routing conventions as authoritative: Next.js App Router uses `src/app/`, not an extra `routes/` tree.

## Core rules

1. Cohesive business behavior belongs with its owning module.
2. Modules are independent by default. Combine sibling modules in route/app composition; document exceptional one-way dependencies.
3. `shared/` never imports business modules, routes, or application setup — including via type-only imports.
4. Pure business rules do not depend on React, HTTP, the browser, or generated response DTOs.
5. Depend on small contracts at meaningful boundaries; don't require interfaces or factories for simple CRUD.
6. Keep **one** module layout: simple `api/model/ui` **or** complex `domain/application/infrastructure/ui`.
7. External callers use a narrow module public API. Internal imports should not go through their own barrel.
8. Test user-observable behavior, runtime validation, and crucial business rules. Batch review and local checks before remote pushes.

## Documentation

| What you need | Where to read |
| --- | --- |
| Canonical architecture | [Architecture](docs/architecture.md) |
| Allowed imports, composition and cycles | [Dependency rules](docs/dependency-rules.md) |
| Decide where new code belongs | [Placement guide](docs/placement-guide.md) |
| Apply and interpret SOLID | [SOLID in React](docs/solid-in-react.md) |
| State, hooks, caching and React Compiler | [React practices](docs/react-practices.md) |
| Migrate existing projects without a rewrite | [Adoption](docs/adoption.md) |
| Review and validation checklist | [Quality and review](docs/quality-and-review.md) |
| Source materials and attribution | [References](docs/references.md) |
| Design decisions and alternatives | [ADRs](docs/decisions/0001-modular-feature-first.md) |
| Coding agent behavior | [AGENTS.md](AGENTS.md) |
| Executable DIP illustration | [Orders example](examples/orders/README.md) |

## Complex feature structure (only when warranted)

~~~text
modules/orders/
├── domain/          # Pure models / invariants
├── application/     # Use cases and consumer-owned ports
├── infrastructure/  # HTTP and persistence implementations, DTO mapping
├── ui/              # React-specific components / hooks
└── index.ts
~~~

Use [ADR 0002](docs/decisions/0002-optional-clean-layers.md) when adopting these layers.

## Framework-specific notes

- **Vite + TanStack Router:** router files/loaders under `routes/`, business code in `modules/`.
- **React Router:** follow the configured mode and its route module conventions.
- **Next.js App Router:** framework routes and layouts under `src/app/`; keep server-only adapters away from client bundles and omit a second route tree.

## Validation

~~~bash
python3 scripts/validate_docs.py
cd examples/orders
npm install
npm test
~~~

The example is **TypeScript without a rendered React app**. It demonstrates domain isolation, application ports, domain-owned analytics adapters, and injection using fake dependencies. The folder conventions are not a substitute for checking your application's actual dependency graph.

No GitHub Actions workflow is included. Adopt the rules within existing project quality gates and preserve security and test checks. Avoid repeated pushes that consume Actions minutes.

## Milestone 1 — executable guidance

The [React reference application](examples/react-app/README.md) demonstrates independent catalog and orders modules with Vite, TanStack Router, TanStack Query, React UI, dependency inversion and tests. The [architecture checker](tools/check-boundaries.cjs) uses TypeScript's AST to inspect imports and prevent invalid dependencies; its [nine fixture tests](tools/check-boundaries.test.cjs) cover both permitted and forbidden patterns. See [milestone verification and limitations](docs/implementation-milestone.md) and [copy-ready coding-agent guidance](agents/react-architecture/AGENTS.snippet.md).

Run local architecture checks after installing TypeScript, or with a globally available TypeScript compiler:

~~~bash
node --test tools/check-boundaries.test.cjs
node tools/check-boundaries.cjs examples/react-app/src
~~~

**Verification note:** the checker and fixtures passed locally, but the React app's npm dependencies could not be installed in the authoring environment, so its Vite build and UI tests remain unverified. The direct dependencies are pinned but a lockfile is not yet available; create one on a network-enabled machine before relying on repeatable installs.

## Validation after findings remediation

The repository's cross-platform full validation entry point is `npm run verify` after dependencies are installed in the repository and both examples. This runs the checker fixtures, source boundaries, standalone orders example tests, and React architecture/typecheck/Vitest/build. Run `python3 scripts/validate_docs.py` for documentation links as well.

The boundary checker supports optional `architecture.config.json` project exceptions, documented in [Dependency rules](docs/dependency-rules.md). Pure layers reject bare package imports by default unless explicitly allowed as framework-independent dependencies. Test files may import Vitest and test helpers.

**Network limitation:** secure package versions were updated, but a trustworthy npm lockfile could not be generated in this isolated environment. Run `npm install --package-lock-only --ignore-scripts` in the project root and each example on a network-enabled development machine, review the dependency audit, commit the generated files and complete all checks *before merging*. No fabricated or partial lockfiles are committed.


## Final review hardening

The checker includes source declaration files, ESM/CommonJS JavaScript extensions, TypeScript import-equals statements and stronger cross-module rules. Checkout selection changes reset earlier mutation feedback and field validation is announced accessibly. The documentation checker tests matched fenced blocks and local links.

For a fresh machine, generate lockfiles from the actual npm registry (not by hand) before merging the PR. Install at the root, in `examples/orders` and in `examples/react-app`, audit dependencies, run `npm run verify`, and smoke-test the app in a browser. Until this is completed, the reference app is intentionally not represented as fully verified.

## Architecture review enforcement update

The checker now distinguishes asset imports (including Vite's `./style.css`) from TypeScript imports and validates the target assets. It applies consistent pure-layer rules to domain, model, application, and pure shared utility code, including a generated-DTO prohibition and rejection of unverified out-of-root aliases. The architecture suite now defines 42 cases.

The React example uses per-instance IDs and structured field-validation results. These are educational patterns, not proof of a production-ready checkout implementation.

**Required before merging:** generate and commit real dependency lockfiles with npm registry access, execute `npm ci` in the root and both examples, run `npm run verify`, perform `npm audit` for each package, and smoke-test the browser app. Do not mark the PR ready based solely on static analysis.

## Follow-up validation and JavaScript support

The architecture checker supports module public entry points in TS/TSX/MTS/CTS and JS/JSX/MJS/CJS, treating a self-barrel import as a violation in each format. Pure layers may **not** import CSS, images or other presentation assets, even though UI and app-level imports remain supported.

The reference checkout keeps a pending-save guard across product switches and disables editing while a save is pending. The test suite defines 42 architecture fixtures plus deferred-promise checkout tests.

This does not replace a real server's order-idempotency protections. npm lockfiles and the full build/security verification remain outstanding until registry access is restored.
