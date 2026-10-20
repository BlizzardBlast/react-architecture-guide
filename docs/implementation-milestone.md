# Milestone 1 — executable architecture

This milestone adds enforcement and a teaching application **without changing the canonical modular-feature-first decision**.

## Architecture checker

`tools/check-boundaries.cjs` uses the TypeScript compiler API to scan static imports, type-only imports, re-exports, `require('literal')` and `import('literal')`, following TypeScript resolution including `tsconfig` aliases.

```bash
node --test tools/check-boundaries.test.cjs
node tools/check-boundaries.cjs examples/react-app/src
```

Install `typescript` as a development dependency in real consumer apps. On developer machines with an existing global TypeScript CLI, the script can also locate the global compiler. Its nine fixture tests assert valid imports and invalid cross-module, deep import, shared leakage, layer, runtime cycle, self-barrel, and unresolved imports; source-only type cycles produce warnings.

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
