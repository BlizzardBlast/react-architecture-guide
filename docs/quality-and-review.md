# Architecture and quality review

## Ownership and dependencies

- [ ] Every new capability has a clear owning module.
- [ ] `shared` remains domain-neutral and imports no business modules or app/routes.
- [ ] Sibling-module interaction is composed or covered by a documented, acyclic public contract.
- [ ] Consumers do not deep-import private module paths.
- [ ] Internal files don't import their own barrel.
- [ ] No runtime cycles; type-only conceptual cycles are examined.
- [ ] Only justified interfaces/layers have been added.
- [ ] In complex modules, domain/application imports point inward, infrastructure implements ports, and UI does not import infrastructure directly.

## React correctness, data and security

- [ ] Domain invariants are pure and tested including invalid/boundary inputs.
- [ ] Rendering is pure, Hooks Rules are followed, and Effects synchronize with external systems.
- [ ] Loading, empty, failure, retry and mutation paths are handled.
- [ ] Query identity includes data-changing inputs and proper security scope.
- [ ] Server-returned data is runtime-validated; generated types are not mistaken for validation.
- [ ] Critical authorization and validation are enforced by the server.
- [ ] Accessible semantic markup, keyboard behavior and responsive layouts are covered appropriately.
- [ ] SSR/client and secret boundaries are respected for framework applications.

## Verification locally and remotely

~~~bash
python3 scripts/validate_docs.py
cd examples/orders
npm install
npm test
~~~

The documentation checker validates only local markdown targets and code-fence balance. It is **not** a TypeScript import-graph analyzer. For production apps add an actual analyzer (e.g., dependency-cruiser), plus targeted tests, formatting, typechecks and security checks to the **existing** quality gate.

Batch research, code changes and review findings; validate locally; push once per coherent change. Do not repeatedly trigger GitHub Actions unnecessarily, but preserve all required checks.

Do not claim SOLID compliance or tests passed from folder appearance alone.
