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

### HTML5 and Vite public output assurance

- [ ] Parse `index.html` using a standards-based HTML5 tokenizer: comment handling in `title`/`textarea`, inert JSON scripts and quoted greater-than characters must agree with a browser.
- [ ] Audit the default Vite `public/` output; reject executable/unknown public formats and symlinks, and allow custom `publicDir` only when explicitly verifiable.
- [ ] Resolve all supported HTML module/script, CSS and media URLs (`src`, `srcset`, icons, modulepreload, relevant asset links) against physical files, preserving module ownership restrictions.
- [ ] Reject unsupported HTML browsing contexts, inline execution/styling and ambiguous resource grammars instead of silently assuming the content is inert.
- [ ] Run a real Vite build and browser/security/accessibility smoke tests to confirm the parsed HTML dependencies correspond to served/bundled output.

### Worker, Vite HTML metadata and multipage verification

- [ ] Verify that worker-specific `plugins`, `rollupOptions` or dynamic options cannot inject unchecked edges; only omitted or empty literal worker configuration is currently supported.
- [ ] Include Vite-recognized `link.imagesrcset` candidates and allowed `meta[content]` image/media variants in the same physical ownership checks applied to `img.srcset`.
- [ ] Reject unaudited secondary HTML pages accessible in Vite dev, including sibling and nested `.html`/`.htm`; separately audit `public/` assets.
- [ ] Keep existing pre-refactor architecture fixtures aligned with precise error names, without weakening genuinely invalid-input tests.
- [ ] Verify actual worker/main builds and dev-server HTML behavior as part of the outstanding complete quality and security gates.

### Nested HTML exclusions, CSS entrypoint ownership and symlink failures

- [ ] Apply Vite HTML discovery exclusions to **specific root-relative output/vendor directories**, not every nested directory with a matching basename.
- [ ] Treat remote/data `stylesheet` and `preload as=style` links as active CSS dependencies that require explicit review and transitive checking; preserve intentional inert remote media.
- [ ] Handle unreadable/dangling symlinks as validation diagnostics without throwing, and reject symlinked HTML documents or directories that could hide additional entrypoints.
- [ ] Exercise both negative bypass cases and harmless controls in the installed architecture tests, plus actual Vite dev-server HTML and stylesheet behavior before merge.

### Vite disabled publicDir, remote stylesheet directives and source symlinks

- [ ] Do not conflate `publicDir:false` with removal of project-root HTML serving; reject unaudited root `public/**/*.html` in this configuration.
- [ ] Reject unverified external or `data:` stylesheet directives introduced by *local* CSS/SCSS `@import`, `@use` and `@forward` while allowing audited Sass built-ins and decorative remote media.
- [ ] Convert broken source and stylesheet realpath/read failures into actionable diagnostics; check dangling/valid internal/external symlink fixtures.
- [ ] Run complete architecture tests and real Vite dev/build/browser checks before declaring the release gates passed.

### First-party discovery and actual Vite development reachability

- [ ] Scan every owned JS/TS and CSS/Sass/Less file under `src/`, including nested `dist`, `coverage`, `build` or `node_modules` folders; verify a transitive private-module import cannot hide behind a skipped basename.
- [ ] Reject/audit root `dist`, `build`, `coverage`, `.next` and `.vite` HTML pages that remain reachable during Vite development; confirm with actual HTTP requests.
- [ ] With `publicDir:false`, validate active/unknown root public assets (JS/CSS/SVG and symlinks) as well as secondary HTML; preserve allowlisted inert media.
- [ ] Treat root third-party `node_modules/` and Git metadata as explicitly scoped exceptions, not proof that Vite never serves them. Perform a real dev/build graph audit before merging.
