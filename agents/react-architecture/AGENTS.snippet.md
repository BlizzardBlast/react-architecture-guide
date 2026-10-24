# React architecture rules (copy into a consuming repository's AGENTS.md)

Before editing React/TypeScript code, read the canonical policy:
https://github.com/BlizzardBlast/react-architecture-guide/blob/main/docs/architecture.md
and the dependency rules:
https://github.com/BlizzardBlast/react-architecture-guide/blob/main/docs/dependency-rules.md

- Keep code in the owning business module, not an indiscriminate global utilities directory.
- Modules are independent by default; compose sibling features in routes or app integration.
- Generic `shared/` may **never** import business modules or app/routes (including type-only).
- Outside consumers use public module entry points; no private deep imports.
- Pure model/domain code never imports UI or infrastructure; in complex modules UI never imports concrete adapters.
- Use Clean Architecture layers **only** for nontrivial business logic, not simple CRUD.
- Respect the project's actual router and React compiler versions.
- Validate server responses at integration boundaries; enforce authorization server-side.
- Run local architecture checks, typechecking, tests, and review in coherent batches before a push.
- Preserve required security and CI checks; avoid unnecessary repeated GitHub Actions executions.

When introducing an exception, document its ownership, dependency direction, justification and test.

- Keep application use cases as independent from concrete HTTP/data implementations as domain models; pure `shared/lib` code must remain pure too.
- Do not import generated API DTOs into domain, model or application layers unless the project's explicitly documented design changes that boundary.
- Static CSS/SVG/image imports may exist in presentation/app code, but their referenced files must exist.
- Use React `useId` for reusable input/label IDs and structured validation errors rather than parsing English message strings.
