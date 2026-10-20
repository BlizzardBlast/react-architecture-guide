# ADR 0001 — Modular feature-first React

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Folder-by-type spreads business changes across shared component, hook and service directories. A full FSD or DDD taxonomy can be excessive for simple React applications.

## Decision

Use `modules/<business-capability>/` as the primary ownership unit, keeping app setup, router files and generic shared primitives separate. Modules do not depend on siblings by default. Route/app integration composes them; public APIs express supported boundaries.

A module is an engineering ownership unit and **not necessarily** a DDD bounded context.

## Alternatives

Folder-by-technical-type, full FSD, full DDD layering everywhere. None is the default for this cross-project reference standard.

## Consequences

Business changes remain local and extractable. Boundary enforcement requires discipline/tooling. Document justified exceptions rather than hiding coupling.

See [Architecture](../architecture.md) and [Dependency rules](../dependency-rules.md).
