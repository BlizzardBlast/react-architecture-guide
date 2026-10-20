# SOLID principles applied to React

SOLID principles originated in object-oriented design. They are **design heuristics**, not a requirement to introduce inheritance, classes or a repository interface for each HTTP request.

## S — Single Responsibility

An artifact should have **one coherent reason to change**, not necessarily only one function. Distinguish domain invariants, API transport, use-case orchestration and presentation when the reasons for change diverge. A large form can compose smaller components or extract a pure validator, but splitting every line into a service creates ceremony.

## O — Open/Closed

Make behavior extensible through composition, props and injected implementations where variability is real. Don't design ten hypothetical provider interfaces in advance. Reuse primitives that can be extended safely without repeatedly editing callers.

## L — Liskov Substitution

Substitute components and services only when callers' **behavioral expectations** still hold. A "replacement" form control must preserve keyboard semantics and error reporting; an alternate repository must satisfy the same success/error/return contract. TypeScript's structural typing alone doesn't prove behavioral substitutability.

## I — Interface Segregation

Prefer small capabilities consumed by actual use cases instead of massive service interfaces. A place-order function should depend on an `OrderWriter.create` capability, not a huge `OrderRepository` with twenty unrelated operations. React props should similarly describe only the data and callbacks needed.

## D — Dependency Inversion

Keep important business policy independent of concrete HTTP clients, localStorage, analytics SDKs, or React rendering. Let the consuming application use case define a small port; infra implements the port. Compose them at app/route or module-local wiring. Pure domain code must not import the implementation.

See the [runnable orders example](../examples/orders/README.md).

## Distinguish good design from abstraction theater

- Good: pure order validation can be tested without rendering React.
- Good: analytics transport knows only primitive event payloads; orders maps its own domain fields.
- Good: swap a fake writer to test business orchestration.
- Excessive: `IOrderRepository` for a single trivial GET solely to check a SOLID box.
- Excessive: four layers for a two-file feature.
- Incorrect: consider a folder structure proof that SOLID is satisfied.

## Practical review

Ask whether responsibilities are cohesive, contracts are narrow, adapters honor behaviors, outward dependencies are inverted where necessary, and abstractions reduce more coupling than they add.
