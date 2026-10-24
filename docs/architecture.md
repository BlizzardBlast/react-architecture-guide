# Architecture — canonical design

## One primary architecture, not three incompatible prescriptions

The **default** is modular, feature-first React. We borrow dependency isolation and small public APIs from Feature-Sliced Design, and selectively use DDD terminology and Clean Architecture layering for genuinely complex business capabilities. We do **not** claim full FSD conformance.

A `module` is a cohesive, owned business capability. A **bounded context** is a conceptual business-model boundary and might contain several modules. Do not equate every React screen or CRUD feature with a bounded context.

## Top-level ownership

| Location | Owns | Must not own |
| --- | --- | --- |
| `app/` | App wiring, setup, providers, router integration | Domain rules |
| `routes/` | Route entry points, loaders, URL-aware composition | General business services |
| `modules/<name>/` | One business capability and its data/UI behavior | Uncontrolled sibling coupling |
| `shared/` | Domain-neutral UI and technical primitives | Business entities, use cases, domain event interpretation |
| `generated/` | Generated integrations and DTOs | Independent source-of-truth domain model |
| `testing/` | Reusable test setup and test helpers | Production business logic |

Route/app components import **module public APIs**, and modules import **shared** primitives. Shared code does not import back upward.

~~~mermaid
flowchart TD
  App[App composition] --> Routes[Route entry points]
  App --> Modules[Module public APIs]
  Routes --> Modules
  App --> Shared[Shared primitives]
  Routes --> Shared
  Modules --> Shared
~~~

## Default simple module

~~~text
modules/orders/
├── api/       # Requests, server state and transport parsing
├── model/     # Pure business rules, types and validation
├── ui/        # React-specific components/hooks and their tests
└── index.ts   # Small external public API
~~~

For a tiny feature, keep files flat. **Never create empty folders to satisfy architecture cosmetics.**

Simple module internal imports: `model` must not import `api` or `ui`. `api` may use `model`. `ui` may use `api` and `model`. External code uses the module's declared public API. Internal code imports implementation files, not the module barrel.

## Optional complex mode

When business behavior involves significant invariants, multi-step workflows, different persistence implementations, or difficult isolated testing, **replace** simple `api/model/ui` responsibilities with four clear layers:

~~~text
modules/orders/
├── domain/           # Pure concepts and invariants
├── application/      # Use cases / consumer-owned contracts
├── infrastructure/   # API, storage, telemetry adapters and DTO mapping
├── ui/               # React components and React hooks
└── index.ts
~~~

~~~mermaid
flowchart TD
  UI --> Application
  Application --> Domain
  Infrastructure --> Application
  Infrastructure --> Domain
  App[App / route composition] --> UI
  App --> Application
  App --> Infrastructure
~~~

- `domain` only depends on framework-agnostic, relevant shared primitives. No React, HTTP, generated API response types or browser globals.
- `application` depends on domain and declares ports it consumes; it does not depend on concrete infrastructure or UI.
- `infrastructure` implements application ports, maps transport DTOs and depends on application/domain contracts.
- `ui` depends on application and domain types/rules, never on concrete infrastructure in complex mode.
- The **composition root** may know concrete implementations and ports because its job is to wire them together. A module-local factory can be exposed by its public API to avoid the app deep-importing internal files.
- Ports should live in the innermost **consuming** layer, usually application. Domain ports may be appropriate if they encode genuine domain concepts.

These principles do **not** mean that every component needs an interface or every feature needs a Provider. React Context can supply a dependency tree, but ordinary function arguments, factories or props are often simpler.

## Handling business boundaries

Keep business-specific formatting and transformations inside the owning module. Generic `shared` analytics or notification transport must not import an Order or Customer type. Use an order-specific adapter that maps domain data to a primitive payload; wire it to the generic transport from composition. See [ADR 0003](decisions/0003-generic-services.md).

Prefer composition across sibling modules. Stable one-way public dependencies are possible exceptions and must be documented; never allow cycles.

## Framework overrides

- **Vite + TanStack Router:** `routes/` contains route files; `app/` configures router/providers; business functionality stays in `modules/`.
- **React Router:** follow the router's selected mode and convention; routes are composition points.
- **Next.js App Router:** `src/app/` is the framework-defined route tree and can host the framework composition boundary. Omit duplicate `routes/`; keep server-only imports out of client bundles.

## Related materials

[Dependency rules](dependency-rules.md) · [Placement](placement-guide.md) · [SOLID](solid-in-react.md) · [Example](../examples/orders/README.md)

## Purity and boundary check behavior

Pure `domain`, `model` and `application` files may import their permitted module layers and audited pure shared utilities, but not generated transport clients or technical `shared/api` services. A genuinely generic and pure `shared/lib` helper must also avoid React and infrastructure imports; its code is checked like a pure module. See [enforced dependency rules](dependency-rules.md).

Static asset imports from presentation code are resolved separately from TypeScript dependencies. An alias referring to a workspace file outside the checked source root cannot be assumed safe without additional project-specific analysis.

## Enforced module mode and migrations

The checker detects mixed simple (`api/model`) and complex (`domain/application/infrastructure`) layers within a module and reports `mixed-module-layout`. During a reviewed incremental migration, declare a nonempty reason in `architecture.config.json` under `allowMixedLayouts` for the affected module. This does not permit importing directly across the two mode-specific structures. See [dependency rules](dependency-rules.md).

Module ownership is determined using physical real paths for source files, so aliases and symlinks cannot make code appear to belong to a different layer or module. Missing or inaccessible package dependencies still require full typechecking and installation validation.
