# Dependency rules and ownership

Folder names express ownership; **import direction and contracts** make that ownership real. Use the [canonical architecture](architecture.md) to decide whether a module should be simple or complex.

## Global dependency boundaries

1. `shared/` never imports `modules/`, `routes/` or `app/`, including type-only imports and static assets.
2. A business module does not import sibling modules by default. Compose them in `routes/` or `app/`.
3. Approved one-way sibling exceptions must be declared in the consuming application's `architecture.config.json` and import only the destination module's public `index.*` entry point. They must be acyclic, including for type-only dependencies.
4. External consumers use module public APIs; internal files import directly rather than through their own module barrel. For JavaScript modules, public entry points and self-barrel restrictions apply to `index.js`, `index.jsx`, `index.mjs` and `index.cjs` as well as TS/TSX/MTS/CTS.
5. Modules never import routes or app composition. Routes don't import app setup.
6. Runtime cycles fail. Cycles spanning modules fail even if entirely type-only; purely internal type-only cycles are warnings for structural review.

## Simple modules

| Importing layer | Allowed dependencies | Not allowed |
| --- | --- | --- |
| `model/` | Local model, pure shared utilities | UI, API, framework, generated DTOs |
| `api/` | Model and technical shared integration | UI, routes, app |
| `ui/` | Local model and API, generic shared UI | Concrete module-private siblings, app setup |
| Module `index.*` | Narrow documented exports | Accidental wildcard public surface |

## Complex modules

| Importing layer | Allowed dependencies | Not allowed |
| --- | --- | --- |
| `domain/` | Local domain and pure shared | Application, infrastructure, UI, HTTP, generated DTOs |
| `application/` | Local application/domain and pure shared | Concrete infrastructure, presentation, HTTP clients |
| `infrastructure/` | Local application/domain/infrastructure and generic technical shared | UI, routes, app |
| `ui/` | Local application/domain, generic shared UI | Concrete infrastructure |
| Module-local composition | Local ports and implementations | Arbitrary sibling-private imports |

`shared/lib/` and `shared/domain/` are intended to be pure and cannot import React, HTTP clients, generated DTOs or non-pure shared folders. External packages in pure code are rejected by default unless individually reviewed and allowed.

## JSON and static assets

CSS, SVG, fonts and images may be imported by presentation and app composition code, provided they exist and do not cross ownership boundaries. Pure domain/model/application/shared utilities cannot import presentation assets. JSON **can** be owned, pure configuration/data: it is allowed only when its location and import path respect the same module ownership and layer rules as source modules.

Imports resolving outside the validated `src/` tree are reported as outside-source references rather than automatically trusted. A multi-package monorepo must validate its other package roots separately or adapt the checker with reviewed configuration; a successful single-root check does not validate all workspaces.

## Optional policy exceptions

Create `architecture.config.json` next to the consuming app's `tsconfig.json`:

```json
{
  "allowPureExternal": ["zod"],
  "allowCrossModule": {
    "payments": ["orders"]
  },
  "allowMixedLayouts": {
    "orders": "Temporary migration from model/api to domain/infrastructure; see issue #123"
  }
}
```

`allowPureExternal` lists explicitly reviewed pure third-party packages used in domain/model/application/pure shared code; it is **not** a blanket exemption for React or HTTP. The checker does not prove that an allowed external package is pure.

`allowCrossModule` only permits eligible UI, infrastructure, API and composition importers to consume sibling **public entry points**. Domain, model and application layers cannot depend on another business module's public barrel merely because an exception exists.

### Module layout enforcement and temporary migrations

Each module uses the simple `api/model/ui` shape or the complex `domain/application/infrastructure/ui` shape, not both. The checker infers the mode from the module's direct layer directories and rejects a module containing both simple-only (`api`, `model`) and complex-only (`domain`, `application`, `infrastructure`) layers.

For an incremental migration, `allowMixedLayouts` maps a module name to a **nonempty, reviewed justification**. It temporarily permits the coexistence of both layouts; it does **not** permit direct imports between simple-only and complex-only layers, unsafe public API exceptions, or cycles. Remove the exception once migration is complete.

### Symlinks and physical file ownership

Source-file symlinks are checked against their physical targets, not just their apparent paths. Aliases that point into a different module/layer, or outside the validated source root, are rejected. Same-owner aliases remain possible. Ownership enforcement applies to type-only and runtime imports.

## Avoid circular "generic" services

A generic `shared/analytics` helper must not import an Order type to format an event. Instead, keep primitive analytics transport in shared and an Order-specific adapter inside orders/infrastructure; compose them at the application boundary. The same pattern applies to logging, notification payloads, permissions and API transport. See [ADR 0003](decisions/0003-generic-services.md).

## Scope of enforcement

Run `node tools/check-boundaries.cjs examples/react-app/src` from the repository root, or `npm run verify` after installation. The checker uses the TypeScript AST and module resolver, not a regex-only import scanner. It checks locally resolved source and asset edges, but cannot reason about nonliteral dynamic imports, runtime globals or semantic ownership of every external package. A production application may also adopt [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) or equivalent tooling; continue to run typechecks, runtime tests, accessibility tests and security audits.
