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

### Import provenance and stable build artifacts

- [ ] Distinguish legitimate bare imports into resolver-discovered installed package directories from relative/project-alias/baseUrl imports targeting arbitrary `node_modules`-named folders; test both TypeScript external-library metadata and ownership.
- [ ] Verify first-party source folders that happen to be named `node_modules` remain owned and subject to all purity/module rules.
- [ ] Run two actual native React builds consecutively without cleaning the checkout, verifying generated output stays outside Vite's dev-served root and neither check produces false architecture errors.
- [ ] Confirm `npm run preview` loads the out-of-root production output and `/dist/hidden.html` inside the app root is still rejected by the architecture checker.

### Import resolution and package CSS ownership

- [ ] Fail closed for installed *bare stylesheet imports* even when TypeScript's module resolver returns no module; include CSS, `.module.css`, Sass/Less and query strings.
- [ ] Keep regular first-party local CSS and explicitly mapped aliases in the owned stylesheet scan; do not mistakenly reject plain JS package imports.
- [ ] Resolve pure-layer `baseUrl` JS/TS imports before labeling them external; allow legitimate first-party pure utilities and reject actual external packages and forbidden cross-layer imports.
- [ ] Validate actual Vite stylesheet graph behavior before adding support for any externally sourced package stylesheet; never replace verified source ownership with a broad dependency allowlist.

### Extensionless package stylesheet exports

- [ ] Check import targets from *matching* package `exports` (including conditional TypeScript declaration targets and CSS import targets), rather than inferring solely from import specifier suffixes.
- [ ] Fail closed on extensionless CSS root/subpath exports, scoped/wildcard cases, bare Stylus imports and unresolved active package imports; do not silently accept unknown bundle edges.
- [ ] Preserve legitimate JS package exports even when the same package exposes separate CSS subpaths; preserve owned first-party aliases and type-only/test-file controls.
- [ ] Verify these cases against actual Vite resolved import graphs and the pinned TypeScript version before release.


### Executable configuration and package mapping assurance

- [ ] npm-script shell redirection, interpolation, and opaque execution cannot change a Vite config between static checking and building.
- [ ] Vite config imports only trusted integration modules, and unknown property initializers, computed test settings or resolution options fail closed.
- [ ] Nearest-package self-name `exports` and `#imports` conditionals cannot disguise a CSS runtime target as an owned TypeScript declaration.
- [ ] Automatically discovered PostCSS configuration (from project or ancestor files/package metadata) is rejected unless the transformed CSS graph is independently verified.
- [ ] The authentic registry-backed lockfiles, pinned suites, two actual Vite builds, dependency audits and browser/accessibility checks are mandatory before merge.

### Type-only and token-boundary regression assurance

- [ ] Runtime package import maps are checked independently of TypeScript-only alias resolution, including `#name?raw`, chained `#imports`, third-party CSS export redirects and same-package self-exports.
- [ ] Fully erased type imports do not generate CSS runtime diagnostics; inline type-only named bindings preserved as runtime empty imports still receive dependency checks.
- [ ] Source CSS scans distinguish complete `url()`, `image-set()` and `load-css()` function identifiers from longer custom function names, including hyphenated and non-ASCII prefixes.

### Executable package maps and Stylus fail-closed assurance

- [ ] Runtime `#imports` and self-name JavaScript `exports` targets are checked independently of the TypeScript-resolved file, including conditional targets, wildcard patterns, runtime cycles, and source-root containment.
- [ ] Ordinary same-owner `.js`-to-`.ts` mappings, erased `import type`, and unrelated installed JavaScript packages continue to work; unknown or unresolvable redirects must not receive a false pass.
- [ ] Stylus `.styl`/`.stylus` files fail closed until their transitive dependency semantics have real build-graph verification, including HTML entrypoints and script side-effect imports.

### Package-query and repeated-target regression checks

- [ ] A mapped `#name?raw` or `#name?url` import is checked as a data/asset dependency, forbidden in pure layers and excluded from executable-cycle edges; the owning source file and architectural boundaries remain checked.
- [ ] `?inline`/`?no-inline` on JS/TS are still executable source imports, including through package imports, self-exports and Vite aliases; genuine `?raw`/`?url` data loads suppress source-execution edges even when combined with inline modifiers.
- [ ] Actual CSS and image imports with `?inline`/`?no-inline` remain assets and fail pure-layer static-asset restrictions; do not mark source-only modifiers as transformed data.
- [ ] Mapped ordinary JavaScript and `?worker` imports remain executable dependency edges; a genuine cycle is still rejected.
- [ ] Repeated safe import-map targets through `node`/`default`, branching aliases or fallback arrays are not mistaken for recursive cycles; unsupported `#`-to-`#` redirects and self-recursive maps are rejected.

### TypeScript/package shadowing controls

- [ ] A runtime bare import cannot be certified by a TS `paths`/`baseUrl` source alias when a same-name installed package would instead be resolved by Vite. Check CSS, JS, scoped/subpath exports and manifestless installed directories.
- [ ] An explicitly audited, matching Vite `resolve.alias` overrides the installed package; unrelated installed packages and `paths: { "*": ["*"] }` fallback resolutions do not generate false collisions.
- [ ] Single-segment and arbitrary multi-segment `baseUrl` imports use actual resolved first-party ownership, not a list of directory-name prefixes; installed CSS/JS/scoped/subpath packages still fail closed when they would shadow owned source.
- [ ] BaseUrl-backed `?raw` or `?url` imports of owned source fail `pure-layer-static-asset` in domain/model/application or pure shared code and stay available in UI; concrete owned baseUrl CSS/images likewise remain assets.
- [ ] Normal baseUrl and TypeScript-path aliases remain owned source for architectural checks, but executable bare imports must also have a verified Vite alias or runtime package mapping; fully erased type imports and ordinary external package fallbacks remain valid. Source-root escapes cannot be certified by bare spelling.
- [ ] Inferred owned baseUrl imports must not override Node `#imports` or package self-exports, including query-qualified `?raw`/`?url` mapped data imports.
- [ ] Fully erased type-only imports remain non-executable and do not generate package runtime diagnostics.

### Runtime query and external wildcard provenance controls

- [ ] TypeScript `paths` (including `"*"`) and `baseUrl` patterns only count as owned aliases when their **resolved target** is first-party; ordinary dependencies that resolve unchanged through unaliased `node_modules` resolution remain external and retain pure-layer and package-style restrictions.
- [ ] Deliberate aliases into `node_modules`, outside-source paths, and owned-source/package collisions must not gain a false pass because an unrelated installed package shares a name.
- [ ] Raw/URL/worker query classifiers use Vite's exact token boundaries: `?raw=true`, `?url=1`, and `?worker=1` must not imitate genuine Vite flags. Unknown syntax fails closed, preserves executable code edges, and cannot bypass public barrels.
- [ ] Verified `?raw`/`?url` data loads, `?worker`/`?sharedworker` entries, and `?inline`/`?no-inline` JS/TS and asset controls keep their respective runtime/asset semantics.

### Vite runtime alias and extensionless data-import assurance

- [ ] An extensionless `./config?raw`/`?url` resolves the same source file as Vite, including normal source extensions and `.json`; genuinely missing files and outside-source symlinks still fail closed.
- [ ] Pure layers reject extensionless transformed source with `pure-layer-static-asset`, while UI code can load supported relative/verified Vite-alias data imports without false `missing-static-asset` errors.
- [ ] Extensionless worker queries retain executable runtime-cycle edges, including through verified Vite aliases.
- [ ] Extensionless `?inline` and `?no-inline` imports targeting owned JS/TS keep executable cycle edges and do not generate false missing-static-asset errors.
- [ ] Runtime imports using TypeScript-only `baseUrl` or `paths` aliases without an audited Vite runtime mapping fail `unverified-vite-runtime-alias`; erased type imports are exempt and installed external packages are classified independently.
- [ ] Preserve ownership and package-shadowing diagnostics even if runtime alias validation also fails; do not exempt executable imports simply because TypeScript found an owned file.


### Runtime resolution and raw-content regression checks

- [ ] Executable local imports follow physical Vite filename and extension precedence, including both `.js` and `.ts` candidates, true runtime cycles and safe type-only substitutes.
- [ ] Missing-JS TypeScript fallbacks and extensionless directory indexes remain usable; unverifiable package-directory entries fail closed.
- [ ] Less `@plugin` fails closed, but inert comments and strings that contain the spelling do not.
- [ ] HTML raw-text `script`, `pre`, `style` and `textarea` elements with literal `<!--` do not hide later active Markdown links.
