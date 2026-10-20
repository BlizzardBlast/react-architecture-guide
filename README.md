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
