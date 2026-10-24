# Architecture and quality review checklist

Use this checklist when reviewing a change to the guide or adopting its rules in a production React project. A passing directory layout is not proof of architectural correctness.

## Ownership and dependency direction

- [ ] Business capabilities have clear owning modules; shared utilities remain domain-neutral.
- [ ] `shared/` does not import modules, routes or application setup, including type-only and asset imports.
- [ ] Sibling-module communication happens in app/routes or through a reviewed, acyclic public-API exception.
- [ ] External consumers use module public `index.*` files. Internal code does not import its own barrel.
- [ ] Pure domain/model/application and pure shared utilities do not depend on technical integrations, generated DTOs or presentation assets.
- [ ] JSON, CSS/images, and JS/TS source imports stay within their physical ownership and source-root boundaries, including symlinks and path aliases.
- [ ] Transitive CSS/Less/Sass imports, CSS url() and quoted image-set() alternatives follow shared, sibling-module and *intra-module layer* restrictions.
- [ ] Less/SCSS line comments cannot trigger phantom dependencies; valid Less literal import options are recognized and unsupported options fail closed.
- [ ] A module does not mix simple (`api/model`) and complex (`domain/application/infrastructure`) layers without a reviewed, justified migration exception; direct cross-mode imports remain forbidden.
- [ ] Cross-module type-only cycles and runtime cycles are rejected; internal type-only cycles are reviewed.
- [ ] Vite globs and computed dynamic imports fail closed; static new URL/Worker references obey source ownership, but only worker and true executable imports create runtime-cycle edges.
- [ ] Vite-only aliases have matching targets in `architecture.config.json` `viteAliases`; no trailing-slash alias names, and unresolved spreads, shorthand and computed resolve configuration fail closed.
- [ ] Query-modified Vite asset imports resolve their physical filenames while preserving ownership and runtime graph checks.
- [ ] Migration exceptions require own property keys, not inherited Object prototype fields.
- [ ] Complex domain/application/infrastructure/UI layers point inward as documented, without unnecessary DI/repositories.

## React, state and security

- [ ] Domain rules have tests for valid, invalid and boundary inputs.
- [ ] Components render purely; Hooks follow their rules; Effects synchronize with external systems.
- [ ] Query keys include source/security scope; catalog and checkout expose accessible loading, empty, error and retry states.
- [ ] Saving cannot be accidentally submitted twice while pending; a rejected save releases guards and enables retry.
- [ ] Product/service changes during a pending save do not unlock another save.
- [ ] Inputs have stable accessible labels, validation associations and meaningful status announcements; a save failure remains visible after switching products.
- [ ] React lint checks enforce Hooks, TypeScript and JSX accessibility rules in the local verification command.
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

### Vite build and plugin integration scope

- [ ] Vite plugins cannot silently create or override aliases, including when the static alias map is empty; document and independently verify any narrowly trusted plugin versions.
- [ ] The real bundler uses only checked root and entrypoint sources. Unsupported custom roots, Rollup/lib/SSR inputs, multi-environment builders and unscanned HTML module/style entries fail static verification.
- [ ] Run an actual Vite resolved-config/build check for supported plugin transforms: static syntax constraints are not a runtime proof.
- [ ] Markdown reference definitions inside multiline inline code are excluded and do not hide active links.

### Runtime source-injection and inline HTML assurance

- [ ] Reject Vite `jsxInject`, CSS preprocessor `additionalData` and other unsupported nonempty computed `esbuild`/`css` settings unless transformed-code dependency edges are independently verified.
- [ ] Check for executable HTML event attributes, JavaScript URL schemes and encoded URI values, `srcdoc`, inline import maps and redirect schemes. None may create unchecked runtime dependencies.
- [ ] Inline `<style>` and `style=` CSS must not bypass ownership checks. Use reviewed source stylesheets and preserve genuinely safe inert HTML attributes and JSON data.
- [ ] Verify the final Vite output and browser behavior independently, even where static syntax is accepted; do not claim that a handwritten HTML token scanner implements the browser parser.
