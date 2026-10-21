# Architecture and quality review checklist

Use this checklist when reviewing a change to the guide or adopting its rules in a production React project. A passing directory layout is not proof of architectural correctness.

## Ownership and dependency direction

- [ ] Business capabilities have clear owning modules; shared utilities remain domain-neutral.
- [ ] `shared/` does not import modules, routes or application setup, including type-only and asset imports.
- [ ] Sibling-module communication happens in app/routes or through a reviewed, acyclic public-API exception.
- [ ] External consumers use module public `index.*` files. Internal code does not import its own barrel.
- [ ] Pure domain/model/application and pure shared utilities do not depend on technical integrations, generated DTOs or presentation assets.
- [ ] JSON and CSS/image imports stay within appropriate ownership and layer boundaries, including path aliases and symlink targets.
- [ ] Cross-module type-only cycles and runtime cycles are rejected; internal type-only cycles are reviewed.
- [ ] Complex domain/application/infrastructure/UI layers point inward as documented, without unnecessary DI/repositories.

## React, state and security

- [ ] Domain rules have tests for valid, invalid and boundary inputs.
- [ ] Components render purely; Hooks follow their rules; Effects synchronize with external systems.
- [ ] Query keys include source/security scope; errors, loading, empty results and retry paths are usable.
- [ ] Saving cannot be accidentally submitted twice while pending; a rejected save releases guards and enables retry.
- [ ] Product/service changes during a pending save do not unlock another save.
- [ ] Inputs have stable accessible labels, validation associations and meaningful status announcements.
- [ ] Untrusted server data is validated; authorization/idempotency is enforced by a trusted backend.
- [ ] SSR services and query clients are scoped correctly; server-only data is not bundled into clients.

## Required validation

```sh
npm ci
npm --prefix examples/orders ci
npm --prefix examples/react-app ci
npm run verify
npm audit
npm --prefix examples/orders audit
npm --prefix examples/react-app audit
```

Also smoke-test browser navigation and checkout flows. These commands require genuine registry-backed lockfiles; install dependencies and commit lockfiles before asserting a reproducible run. The source checker is not a substitute for TypeScript, React runtime tests, a vulnerability audit or a comprehensive monorepo dependency graph.

Review changes and findings together, validate locally, and push once per coherent batch. **Never remove required tests or security checks just to save GitHub Actions minutes.** If a check is blocked, state why, keep the PR in draft, and do not claim success.
