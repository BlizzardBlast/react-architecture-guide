# ADR 0002 — Optional Clean Architecture layers

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Some React modules contain complex business policy and multiple integration implementations. Many contain only a form and a GET request; forcing interfaces and four folders everywhere adds unnecessary ceremony.

## Decision

Start with a flat or `api/model/ui` module. When justified, **replace** it with `domain/application/infrastructure/ui`. Pure domain rules depend only on relevant pure primitives. Use cases consume narrow ports. Adapters implement ports. UI handles React. Composition assembles concrete dependencies.

By default, place capability contracts at their **consuming** application boundary, rather than always in domain. Domain interfaces are permitted when they encode meaningful domain abstractions.

## Consequences

Enables pure unit tests and integration substitutions at the cost of more explicit composition. Complexity is justified module by module.

See [Architecture](../architecture.md) and [SOLID](../solid-in-react.md).
