# Milestone 1 — executable architecture

This milestone adds enforcement and a teaching application **without changing the canonical modular-feature-first decision**.

## Architecture checker

`tools/check-boundaries.cjs` uses the TypeScript compiler API to scan static imports, type-only imports, re-exports, `require('literal')` and `import('literal')`, following TypeScript resolution including `tsconfig` aliases.

```bash
node --test tools/check-boundaries.test.cjs
node tools/check-boundaries.cjs examples/react-app/src
```

Install `typescript` as a development dependency in real consumer apps. On developer machines with an existing global TypeScript CLI, the script can also locate the global compiler. Its 29 fixture tests assert valid imports and invalid cross-module, deep import, shared leakage, layer, runtime cycle, self-barrel, and unresolved imports; source-only type cycles produce warnings.

**Limitations:** dynamic computed imports cannot be statically resolved, semantic ownership cannot be proved by tooling, and this focused checker does not replace production tools such as dependency-cruiser, TypeScript compilation, ESLint/oxlint, or tests. It does not enforce every possible framework or folder convention. It assumes `src/` under one app and does not interpret path aliases without the corresponding `tsconfig`.

## Runnable React illustration

`examples/react-app/` demonstrates React with Vite, TanStack Router, TanStack Query, one simple catalog module, one complex orders module, local validation, dependency inversion, business-specific analytics and an app composition root. See [its README](../examples/react-app/README.md).

It intentionally uses an in-memory adapter rather than pretending to implement production authorization, persistence or a secure API.

## Coding agents

[Copy-ready AGENTS instructions](../agents/react-architecture/AGENTS.snippet.md) can be adapted in each consumer repository. Changes to this guide do not automatically update other repositories or their agents.

## Verification and reproducibility

- Architecture fixture suite and analyzer on the React source tree were tested with a local TypeScript compiler.
- The React UI compilation, browser launch and Vitest UI tests require npm dependencies and **were not run in the authoring environment**, which cannot access the package registry.
- The React app uses exact direct package versions, but lacks a generated dependency lockfile; it must be created and verified in a network-enabled environment before calling the app dependency installation fully reproducible.
- No GitHub Actions workflow was added. Batch local checks and one push when possible, without sacrificing quality/security.

## Code review remediation — October 2026

The implementation addresses the review's principal concerns: external dependency purity, Windows-safe path comparison and globally installed TypeScript discovery, TypeScript `verbatimModuleSyntax` runtime-import semantics, parsing syntax diagnostics and JSX, resolution of `baseUrl` and `paths` aliases, explicit one-way public-module exceptions, service-scoped TanStack Query keys, expanded regression fixtures, and a consolidated `npm run verify` command.

The React example uses Vite **7.3.7** and Vitest **4.1.12** based on published security patches. Pinning direct dependencies **does not** replace a complete `npm audit`, trusted lockfile, verified install, typecheck, UI tests and production build. The authoring environment cannot contact npm's registry; the lockfiles and runtime validation **remain required before merge**. Keep PR #1 in draft until these steps are completed.


## Follow-up review corrections

The checker now visits declaration-file dependencies, JavaScript `.mjs`/`.cjs`, and TypeScript `import = require(...)`. It rejects cross-module imports originating from pure domain/model/application layers, even if a public API exception has been granted. Type-only cycles spanning two or more modules fail the architecture gate; purely intra-module type cycles remain warnings.

The architecture test suite now contains **29 top-level tests**, and the Markdown validator has **6 negative/positive tests** for fence syntax and local link integrity.

The React example clears stale checkout messages on selection changes, validates customer input before mutation, and connects validation feedback to the input for assistive technology. Its query-cache scope remains per service instance.

### Remaining external prerequisite

Dependencies were not available from npm in this authoring environment. Actual `package-lock.json` files and `npm ci` / `npm audit` / Vite build / Vitest runtime checks must be generated and run in a network-enabled environment before marking the draft PR merge-ready. Do not substitute fabricated dependency resolution or describe static checks as equivalent to full runtime validation.
