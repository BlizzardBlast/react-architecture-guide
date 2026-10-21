# Dependency ownership and import rules

A good folder structure is a naming convention. **Import direction** and contracts determine whether modules stay independent.

## High-level rules

1. `shared/` never imports `modules/`, `routes/`, or `app/`, **including type-only imports**.
2. `modules/<A>` does not import `modules/<B>` by default. Instead, compose them in routes/app. Document rare one-way public-API exceptions.
3. `routes/` may compose multiple modules and shared components. Do not let routes import app setup and create an `app → routes → app` cycle.
4. `app/` can import routes, modules' public APIs and shared components to configure the application.
5. Outside a module, import only its explicit public API. Do not deep-import private implementation paths.
6. Inside a module, use direct relative imports; do not import your own `index.ts` barrel.
7. Avoid uncontrolled `export *` trees; expose only stable dependencies.

## Simple internal mode

| Importer | May import | Forbidden |
| --- | --- | --- |
| `model/` | Other pure model files, relevant shared pure utilities | `ui/`, `api/`, app, routes |
| `api/` | Model, technical shared API clients | UI, routes, app |
| `ui/` | Model, API, shared UI | App setup, sibling implementation |
| Module `index.ts` | Exposes intentional public API | Broad wildcard-export of internals |

## Complex internal mode

| Importer | May import | Forbidden |
| --- | --- | --- |
| `domain/` | Domain and pure shared primitives | React, application, infrastructure, UI |
| `application/` | Domain, application-owned ports | Concrete infrastructure, UI |
| `infrastructure/` | Application ports, domain, generic shared clients | UI, routes, app |
| `ui/` | Application use cases, domain, shared UI | Concrete infrastructure in component/hook |
| Composition root | UI, application and concrete infrastructure to wire dependencies | Owning arbitrary domain business decisions |

A module-local composition factory can import implementations and expose one small factory from the module public API. This should not give unrelated modules deep access to internals.

## Avoid the "generic circular dependency" problem

**Bad**: `shared/analytics.ts` imports `modules/orders/domain/order.ts` only to create a payload. If orders also imports the shared analytics tool, ownership becomes circular or conceptually coupled. Even `import type` creates a source dependency and change propagation.

**Good**: `shared` declares `AnalyticsClient.track(name, primitiveFields)`. `modules/orders/infrastructure/order-analytics.ts` imports the order type and maps it to a generic event payload. Higher-level composition wires the two together. Domain-specific notifications, logging, permission mapping, and API transport follow similar rules.

### Classify cycles

| Cycle | Default response |
| --- | --- |
| Runtime dependency cycle | Reject/fix |
| Type-only cycle | Investigate structural coupling and possible ownership inversion |
| Shared infrastructure importing domain types | Reject for business-neutral primitives |
| One-way stable public dependency | May be permitted by an explicitly documented exception |
| Genuine shared domain model | Establish a small, stable shared kernel with defined ownership; don't dump every common type into `shared` |

A type-only import does not execute at runtime, but still expresses source-level dependence. Not every one-way dependency merits new layers or factories.

## Enforcing boundaries

Production apps should configure a dependency analysis tool such as [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), including TypeScript aliases and type-only imports. Add targeted rules for `shared`, public API access, sibling modules, complex-layer direction and cycles.

Run this in the existing local/CI quality gate. No ruleset is presented as universal; account for Next.js route conventions, test imports, generated code, source aliases, and justified exceptions. A regex-only check is insufficient for accurate module graph enforcement.

See [Architecture](architecture.md) and [ADR 0003](decisions/0003-generic-services.md).

## Enforced exceptions and pure external dependencies

The executable checker supports an optional `architecture.config.json` file alongside the consuming application's `tsconfig.json` (the parent of `src/`). Use the following **only when reviewed and justified**:

~~~json
{
  "allowPureExternal": ["zod"],
  "allowCrossModule": {
    "payments": ["orders"]
  }
}
~~~

- `allowPureExternal` names explicitly reviewed packages that can be used by **non-test** pure domain/model/application files and pure shared utilities without making domain behavior depend on React, HTTP or state-management frameworks. Keep this list very small. Any unlisted bare package import in pure code fails by default.
- `allowCrossModule` lists approved one-way module dependencies. The importer may use only the destination module's **public `index.ts` or `index.tsx`**, never its internal implementation. Runtime cycles always fail; source-level cycles spanning modules also fail, including type-only cycles.
- TypeScript `baseUrl` and `paths` are read from the consuming project's `tsconfig.json`. Unresolved internal aliases are errors, not silently skipped.
- Unit test files may import their test framework without being mistaken for production domain code. Import restrictions elsewhere still apply.

This checker implements practical rules for conventional `src/` layouts; it is not a full security sandbox, semantic proof or substitute for production typechecking, vulnerability auditing and a comprehensive dependency graph.


## Important cross-module and declaration-file restrictions

- Pure `domain/`, `model/` and `application/` modules **cannot import another module's public barrel**, even when `allowCrossModule` contains an exception. Use route/app orchestration or move stable concepts into an independently owned, pure contract.
- `allowCrossModule` permits deliberate imports only by eligible UI, infrastructure, API, or module-composition code through the destination module's declared public API.
- Circular dependencies **across modules** are rejected, including cycles that contain only type imports. Intra-module type-only cycles are warnings for review. Runtime cycles always fail.
- Source-owned `.d.ts` declarations and `.mjs`/`.cjs` modules are included in the graph. TypeScript import-equals references are also collected.

These restrictions take precedence over the more general discussion of type-only cycles above.

## Full pure-layer dependency rules

The static checker now restricts `domain/`, `model/`, `application/`, `shared/lib/` and `shared/domain/` to other pure code. In particular, these layers cannot import `shared/api/`, `shared/ui/`, `generated/`, or `testing/`. Pure shared subdirectories cannot import React, HTTP SDKs or other packages unless the precise dependency is explicitly reviewed in `allowPureExternal`.

This is **direct dependency enforcement plus recursively checked pure shared source**. It does not prove global-variable purity (e.g., calls to `fetch` without importing a module), and explicit package allowlists must be audited by the adopter.

The checker recognizes relative and `tsconfig.paths`/`baseUrl`-aliased static assets such as CSS, SVG and images. It checks that the target file exists, without treating it as a TypeScript dependency. It also flags resolved internal project aliases pointing **outside the scanned source root** instead of silently ignoring workspace code. For multi-package monorepos, configure project scopes and validate each relevant source root. Workspace exceptions must be documented rather than inferred.

Literal dynamic import/require calls are analyzed even with additional arguments; computed runtime specifiers are not statically checked.
