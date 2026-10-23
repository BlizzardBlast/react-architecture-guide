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

### Vite imports and alias integrity

`import.meta.glob` and `import.meta.globEager` are **unsupported and fail closed** in the current checker. They are never silently treated as safe. Prefer explicit imports until auditable glob expansion is implemented, including for eager and lazy globs.

When a project defines Vite `resolve.alias` in `vite.config.ts`, mirror each literal alias name in `architecture.config.json` under `viteAliases`. Values are target paths relative to the app directory (the parent of `src/`). The checker compares mirrored paths against statically inspectable Vite targets and rejects mismatches or unverifiable computed aliases. Supported Vite forms are absolute target string literals and `fileURLToPath(new URL('./src/...', import.meta.url))`. Shorthand or computed `resolve`, configuration spreads, dynamic alias factories, regex/array aliases and imported configuration factories fail closed. An alias declared in `architecture.config.json` but missing from the Vite config is also a violation. The two maps must preserve alias order, because overlapping prefixes can otherwise resolve to different files. Trailing-slash alias keys such as `@/` are rejected because they do not use Vite/Rollup's exact-or-following-slash matching. Use the alias key `@` with imports starting `@/`. Plugin-created aliases are not inspected by this static checker; production builds should additionally validate the effective Vite resolver. Vite root-absolute `/src/...` paths are also checked against normal module ownership.

For example, in `vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
export default {
  resolve: {
    alias: { '@orders': fileURLToPath(new URL('./src/modules/orders', import.meta.url)) },
  },
};
```

Mirror its resolved target:

```json
{ "viteAliases": { "@orders": "src/modules/orders" } }
```

The checker does not execute the Vite config. Unverifiable dynamic configuration must be changed or explicitly integrated into a trusted module resolver; never silently bypass the architecture check. Alias targets cannot be used to evade shared or sibling module boundaries.

### Vite dynamic imports, worker modules and URL assets

Vite can compile variable dynamic `import()` expressions into module dependencies. The checker **fails closed** on nonliteral dynamic `import()` and computed `require()` rather than silently overlooking their edges. Replace them with reviewed explicit imports or implement a separate trusted enumeration policy.

For Vite's `new URL('./asset.ext', import.meta.url)` and `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` syntax, the checker records statically specified local URLs as dependencies. Both must pass ownership, pure-layer and cross-module checks. A standalone `new URL()` reference is not an executable source-module import and does not create a runtime-cycle edge; a `Worker` or `SharedWorker` entrypoint does. Dynamic URL targets fail closed. Generic external URLs are not treated as local source dependencies.

Vite import query suffixes such as `?url`, `?raw`, `?inline`, `?no-inline`, and `?worker` are removed **only for filesystem resolution**. The full import specifier is retained in diagnostics; query-modified worker/source entrypoints still participate in the runtime graph, while `?raw` and `?url` data imports do not create execution-cycle edges.

These AST rules cover documented syntax, not arbitrary plugin transformations or the complete bundler graph. For complex Vite customizations, independently inspect the production output and effective bundler configuration rather than claiming the source checker provides a full security boundary.

### Transitive stylesheet ownership

Stylesheets are also architectural dependency sources. The checker scans `src/**/*.css`, `*.scss`, `*.sass`, and `*.less`, including stylesheets that are referenced by other stylesheets. Literal `@import`, Sass `@use`/`@forward`, CSS `url()`, and literal quoted `image-set()` image choices are checked against **the same shared/sibling and intra-module layer-direction policy as JavaScript/TypeScript**, plus the scanned source root. Vite aliases are honored for these references; stylesheets cannot disguise a private business asset as shared code.

Nonliteral expressions (such as `url(var(--asset))`), multi-target Sass imports, computed `meta.load-css()` calls, and unverified local/package paths produce explicit diagnostics instead of being silently accepted. The scanner recognizes Less/SCSS/Sass `//` comments without treating unquoted URL schemes as comments. Literal Less import options such as `@import (reference, optional) "./tokens.less"` and `@import (inline) "./base.css"` are supported in `.less` files; unsupported options fail closed. A missing `(optional)` target is allowed, but an existing optional target must still respect the same boundaries. Sass/Less interpolation such as `url("#{$name}/asset.svg")` is rejected as unverifiable, not mistaken for a safe fragment. Literal `image-set()` choices are conservatively validated, although the bundler may handle individual string choices differently. Data URLs, fragments, remote URLs and built-in `sass:` modules are not local source dependencies. This is a **conservative static scanner**, not a full CSS/Sass/Less/PostCSS compiler. Custom transformations or unusual preprocessor resolution must be verified against the actual build output separately.

Run the stylesheet scanner's own tests through root `npm run test:architecture`, which includes `tools/css-dependencies.test.cjs`. See [Less import options](https://lesscss.org/features/#import-options) for supported syntax. As always, use a real Vite build to validate bundler behavior.

## Avoid circular "generic" services

A generic `shared/analytics` helper must not import an Order type to format an event. Instead, keep primitive analytics transport in shared and an Order-specific adapter inside orders/infrastructure; compose them at the application boundary. The same pattern applies to logging, notification payloads, permissions and API transport. See [ADR 0003](decisions/0003-generic-services.md).

## Scope of enforcement

Run `node tools/check-boundaries.cjs examples/react-app/src` from the repository root, or `npm run verify` after installation. The checker uses the TypeScript AST and module resolver, not a regex-only import scanner. It checks locally resolved source and asset edges, but cannot reason about nonliteral dynamic imports, runtime globals or semantic ownership of every external package. A production application may also adopt [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) or equivalent tooling; continue to run typechecks, runtime tests, accessibility tests and security audits.

### Resolver integrity and alias trust

The architecture checker checks **physical destinations**, not just recognizable import prefixes. Bare `baseUrl` imports resolving to local files outside the validated `src/` tree are rejected. For TypeScript `paths` imports of styles and assets, the most-specific path pattern wins; mirror any bundler-specific resolution (including Vite aliases) with a real build and conformance tests.

To use the supported Vite expression `fileURLToPath(new URL('./src/...', import.meta.url))`, **import `fileURLToPath` directly from `node:url`**, and do not shadow either that function or the global `URL` constructor. The checker does not evaluate arbitrary Vite JavaScript or plugin aliases, so such configurations need independent bundler-level validation.


### Pure dependency target policy and Vite import modes

Pure `domain/`, `model/`, and `application/` code can depend only on the allowed layers within the **same module** and domain-neutral `shared/lib/` or `shared/domain/` helpers. Pure shared helpers can depend only on pure shared helpers. Any unfamiliar top-level source folder (for example `integrations/` or `utils/`) is **not implicitly pure**; decide its ownership and place it in the correct known layer instead of inventing exceptions. Test files may use development-only dependencies without turning production code into a technical dependency.

Ordinary, owned JSON data may be consumed by pure modules. A Vite suffix such as `?raw`, `?url`, `?worker` or a plugin-specific query changes the import mode, so a `.json` or `.ts` filename alone does not make the resulting value pure. Pure modules reject these query-modified local assets, as well as static `new URL(..., import.meta.url)` asset handles. Presentation code may still use supported Vite asset modes subject to source ownership checks.

Architecture test fixtures must store their exact declared contents. Valid Vite URL helper fixtures explicitly import `fileURLToPath` from `node:url`; fixture setup must never supply missing imports on their behalf.

### Nonstandard and CommonJS Vite configurations

The checker inspects all six default Vite config extensions: `.ts`, `.mts`, `.js`, `.mjs`, `.cts` and `.cjs`. It handles statically readable `module.exports = { ... }` for CommonJS; additional top-level CommonJS side effects and dynamic exports fail validation. When any npm script selects a nonstandard path with `vite --config`, declare that exact project-relative filename in `architecture.config.json`:

```json
{
  "viteConfig": "custom.vite.config.ts",
  "viteAliases": {
    "@": "src/shared"
  }
}
```

A declared file must remain within the project (including after following symlinks). Inconsistent Vite configuration selections across npm scripts are rejected. Configurations launched with an external CLI argument that is not represented in scripts must likewise be declared explicitly; untracked external launchers are outside the checker’s automatic discovery scope.

For `fileURLToPath(new URL(path, import.meta.url))` aliases, the checker uses actual `URL` and `fileURLToPath` behavior, including percent-decoding and normalization of encoded dot segments. It rejects invalid encoded separators and mismatches against the policy-mirrored physical path. As before, arbitrary Vite plugins and runtime configuration transformations require a separate real build-level check.
