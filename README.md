# React Architecture Guide

**A pragmatic, feature-first React + TypeScript architecture based on SOLID, ownership, and enforceable dependency boundaries.**

This is a reference standard, not a mandatory scaffold, a complete DDD implementation, or a promise that a particular folder structure guarantees SOLID compliance. Start with simple modules; use additional layers only when business complexity warrants them.

## Default structure

```text
src/
├── app/                      # Providers, router, application composition
├── routes/                   # Framework-specific route entries (if applicable)
├── modules/
│   └── orders/
│       ├── api/              # Server requests and transport mapping
│       ├── model/            # Pure business data and rules
│       ├── ui/               # React components and hooks
│       └── index.ts          # Narrow external public API
├── shared/
│   ├── api/                  # Generic technical HTTP clients
│   ├── ui/                   # Generic visual components
│   └── lib/                  # Pure, domain-neutral utilities
├── generated/                # Optional generated API clients/DTOs
├── testing/                  # Shared test support
└── main.tsx
```

Do not create empty directories to fit the diagram. A module is a cohesive business capability, not automatically a DDD bounded context. Next.js App Router uses `src/app/` as its route tree; do not duplicate it as `routes/`.

For complex business workflows, **replace**, rather than combine blindly, the simple module internals with `domain/application/infrastructure/ui`. The checker rejects mixed structures unless a documented `allowMixedLayouts` migration exception exists; even during migration, direct cross-mode imports remain forbidden. Application ports belong in the consuming layer by default. Avoid mandatory repositories, global DI containers, and speculative abstractions.

## Non-negotiable boundaries

- `shared/` must not import `modules/`, `app/` or `routes/`, even through type-only imports or assets.
- Sibling modules are independent by default. Compose them in routes/app. Reviewed one-way exceptions use only the destination module's public `index.*` entry point.
- Domain, model, application, and pure shared utilities do not depend on React, HTTP clients, generated DTOs, technical shared services, or presentation assets. Pure packages need explicit, reviewed allowlisting.
- A module's internal code imports its own files directly, not its public barrel. External consumers access the public API, not private implementation paths.
- Runtime cycles and cross-module type cycles are rejected. Intra-module type-only cycles require review.
- Presentation code may import local styles/images/JSON within ownership boundaries; pure code may import owned JSON data without importing technical layers. Physical source-file symlinks cannot change module ownership.
- React Hooks follow React's rules. Query identity reflects data scope; mutations, errors, loading, accessibility, and server validation need meaningful tests.

## Guides and examples

| Topic | Reference |
| --- | --- |
| Architecture rationale and feature layouts | [Canonical architecture](docs/architecture.md) |
| Import rules and enforcement exceptions | [Dependency rules](docs/dependency-rules.md) |
| Where new code belongs | [Placement guide](docs/placement-guide.md) |
| SOLID in React | [SOLID guidance](docs/solid-in-react.md) |
| Hooks, caching and React Compiler | [React practices](docs/react-practices.md) |
| Incremental adoption | [Adoption](docs/adoption.md) |
| Quality and code review | [Review checklist](docs/quality-and-review.md) |
| Reference sources | [References](docs/references.md) |
| Architectural decisions | [ADRs](docs/decisions/0001-modular-feature-first.md) |
| Reusable coding agent guidance | [Copy-ready AGENTS instructions](agents/react-architecture/AGENTS.snippet.md) |
| Pure TypeScript port/adapter example | [Orders example](examples/orders/README.md) |
| Vite, React, TanStack Router + Query app | [React reference app](examples/react-app/README.md) |
| Implementation scope and limitations | [Milestone and verification](docs/implementation-milestone.md) |

## Local verification

Requires a compatible Node installation and genuine npm dependencies in all three package directories:

```sh
npm ci
npm --prefix examples/orders ci
npm --prefix examples/react-app ci
npm run verify
npm audit
npm --prefix examples/orders audit
npm --prefix examples/react-app audit
```

`npm run verify` runs the Markdown fixture and link checks, architecture fixture tests, standalone orders example, and React example tests/typecheck/architecture/build. The individual checker can be run with `node tools/check-boundaries.cjs examples/react-app/src`. Do not interpret a test existing as a test having passed.

**Current draft-PR limitation:** This execution environment cannot reach the npm registry, and this branch has no authentic committed lockfiles. First generate and commit lockfiles with real registry access (`npm install --package-lock-only --ignore-scripts` in each directory), then perform the clean installations, audits and browser smoke tests above. Do not merge before full verification.

No new GitHub Actions workflow is required merely for this guide. Preserve all quality and security gates in consumer repositories and batch local validation before pushing to reduce Actions consumption.
