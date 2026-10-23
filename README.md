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
- Domain, model, application, and pure shared utilities do not depend on React, HTTP clients, generated DTOs, technical shared services, or presentation assets. Purity uses an allowlist of owned module layers and pure shared directories; unfamiliar top-level folders are not assumed pure. Vite query-modified JSON/source files and `new URL()` assets are not pure data imports. Pure packages need explicit, reviewed allowlisting.
- A module's internal code imports its own files directly, not its public barrel. External consumers access the public API, not private implementation paths.
- Runtime cycles and cross-module type cycles are rejected. Intra-module type-only cycles require review.
- Unverifiable `import.meta.glob`, nonliteral dynamic `import()` and computed local URLs are rejected explicitly (fail closed). Static `new URL(..., import.meta.url)` and Vite worker references are checked for ownership. Vite `resolve.alias` imports must be mirrored in `architecture.config.json` as `viteAliases`, with matching inspectable targets. Unsupported computed, shorthand and spread-based Vite resolution is rejected. Vite root-absolute `/src/...` imports are checked. Transitive CSS/Sass/Less imports, url() and literal image-set() asset references use the same module-layer ownership rules as code; standalone new URL references do not create false execution cycles. Presentation code may import local styles/images/JSON within ownership boundaries; pure code may import owned JSON data without importing technical layers. Physical source-file symlinks cannot change module ownership. Source checks reject local bare `baseUrl` imports outside the scanned root; overlapping TypeScript path mappings for assets follow the most-specific pattern. Vite `fileURLToPath` expressions require a genuine unshadowed `node:url` import.
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

`npm run verify` runs Markdown checks, architecture regression tests, the standalone orders example, and the React example's ESLint React Hooks/JSX accessibility rules, tests, typecheck, architecture check and Vite build. The individual checker can be run with `node tools/check-boundaries.cjs examples/react-app/src`. Do not interpret a test existing as a test having passed.

**Current draft-PR limitation:** This execution environment cannot reach the npm registry, and this branch has no authentic committed lockfiles. First generate and commit lockfiles with real registry access (`npm install --package-lock-only --ignore-scripts` in each directory), then perform the clean installations, audits and browser smoke tests above. Do not merge before full verification.

No new GitHub Actions workflow is required merely for this guide. Preserve all quality and security gates in consumer repositories and batch local validation before pushing to reduce Actions consumption.

### Vite configuration verification

Supported default Vite configuration names include `vite.config.ts`, `.mts`, `.js`, `.mjs`, `.cts` and `.cjs`. CommonJS files use a statically inspectable `module.exports = { ... }` form; unsupported computed configurations or additional CommonJS side effects fail closed. If an npm script passes `vite --config custom-file.ts`, declare `"viteConfig": "custom-file.ts"` in `architecture.config.json` alongside any mirrored `viteAliases`. Scripts selecting different configs fail closed. The checker verifies static aliases using real file-URL resolution semantics, not string-only path joining.

### Conservative Vite script checking and Markdown validation

The checker recognizes both `vite build -c custom.config.ts` and `vite build --config custom.config.ts`, including explicit local Vite executable paths. Effective Vite configuration resolution depends on the executable **and** its project root, not merely a `vite` string anywhere in an npm script. Scripts changing working directories, passing positional Vite roots, or using unsupported wrappers/options now fail validation rather than silently checking the wrong Vite aliases. Nested shell interpreters (such as `sh -c`, `bash -lc`, `cmd /c`, and PowerShell `-Command`) cannot be safely verified statically, so they are explicitly rejected, including scripts launched through `env` or `cross-env`. Ordinary `vite --host` remains supported with or without a hostname. Keep build commands simple; review the actual Vite output and any plugins separately.

Markdown validation recognizes escaped comment delimiters, existing HTML comments that close inside backticks, and indented code that must not start an HTML comment. The validator also distinguishes `<!--` inside inline Markdown link destinations or quoted titles from real HTML comments; those links remain eligible for normal path checks. This lightweight validator is not a complete CommonMark parser; use a conformant Markdown renderer or checker when extending supported syntax. The checker now also protects reference-definition destinations and titles, and accepts `defineConfig` only from trusted `vite`/`vitest/config` imports; opaque external build runners fail closed. The `arch` helper is trusted only when its complete command is the plain local architecture checker with no appended commands or npm lifecycle hooks. The checker also validates `prebuild`/`postbuild` and corresponding dev and namespaced hooks, since npm executes them automatically. It now checks npm `pre*`/`post*` hooks for any script defined in the project, including `verify` and `test` orchestration; opaque commands fail closed. CommonJS `module.require(...)` and `module["require"](...)` are included in module ownership and runtime-cycle checks, while detached, computed and `createRequire` loaders fail closed. Assigning or passing Node's `require`/`module` loader identifiers is also rejected unless the syntax remains one of the documented direct forms. Build/verify/test scripts and reachable npm delegations are verified as a graph; opacity or cycles are errors. Multiline reference-definition titles and image labels are protected from phantom HTML-comment openers. Bracketed reference-style image and link labels (including shortcut and collapsed forms) also protect literal `<!--` from being misread as an open HTML comment.

The Markdown linter uses a documented restricted CommonMark subset. Its balanced bracket-label lexer handles escaped `]\` and nested labels and preserves real comments outside links; for complete CommonMark grammar conformance, replace it with an established parser when package installations and authentic lockfiles are available.

### Verification scope: npm delegation and Markdown links

For npm-script config verification, only unmodified `npm run <script>`, `npm run --silent <script>`, `npm test` and `npm start` are statically trusted. Forwarded `--` arguments, `--workspace`, `-w`, `--prefix`, filters, package switching and other modifiers fail closed because they can change which Vite config actually executes. Direct Vite invocations still undergo config verification. Node's deprecated `process.mainModule` loader is disallowed in checked sources, including its bracket notation. Markdown nested inline labels now use the same balanced bracket logic for both comment detection and link-target extraction; this validator remains a restricted CommonMark subset.
