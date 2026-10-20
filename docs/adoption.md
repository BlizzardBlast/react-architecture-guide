# Incremental adoption

## New project

1. Follow your framework's router conventions.
2. Start with one business `modules/<capability>/` and only the files it actually needs.
3. Add `model/api/ui` separation as the module grows; keep API and React concerns out of pure model rules.
4. Extract `shared/` primitives only when genuinely domain-neutral, reusable behavior exists.
5. Expose deliberate public APIs when modules acquire outside consumers.
6. Add import-boundary analysis to existing typecheck/test workflows.

## Existing project

1. Inventory the dependency graph, including type-only imports.
2. Map business ownership and likely change boundaries.
3. Refactor one vertical slice at a time rather than an all-at-once rewrite.
4. Move domain-specific behavior out of allegedly generic shared modules.
5. Extract pure business invariants and establish tests.
6. For complex modules, add application ports, infrastructure adapters, and composition.
7. Adopt automated boundary checks, starting with clear failures and recording justified exceptions.
8. Retest integration and E2E flows before shipping.

## Promoting simple to complex

Good triggers include nontrivial invariants, multi-step workflows, multiple data sources, repeated coupling-related defects, and a clear testing payoff. Arbitrary file counts, screenshots or an "enterprise" label are not enough.

**Replace** responsibility locations (`model` → `domain`, `api` → `infrastructure`, feature React hooks → `ui`). Don't retain both simple and complex layouts as competing homes.

A bounded context should reflect distinct business language and invariants, not arbitrary folders.

## Recording exceptions

Use an ADR with context, ownership, alternatives, decision, consequences, affected modules and the tests/checks that prevent a regression. Begin with [ADR 0001](decisions/0001-modular-feature-first.md).
