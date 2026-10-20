# ADR 0003 — Domain-neutral generic infrastructure

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Shared analytics, notification, logging, authorization or networking helpers sometimes import feature-owned types. Their supposedly generic boundary becomes coupled to business concepts, including through type-only imports.

## Decision

`shared` must not import business modules, routes or app setup. Define generic technical contracts in shared and keep domain-specific mapping/adapters in the owning module. Composition injects the generic capability.

Reject runtime cycles; examine type-only conceptual cycles. Small stable one-way public contracts may be documented exceptions where appropriate.

## Consequences

An adapter may add a small amount of code but reduces business coupling and change propagation.

See [Dependency rules](../dependency-rules.md) and [References](../references.md).
