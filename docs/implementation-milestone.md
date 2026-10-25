# Milestone 1 — Executable architecture

This milestone makes the [modular, feature-first standard](architecture.md) demonstrable without imposing a mandatory scaffold or a heavyweight architectural framework.

## What is included

- [`tools/check-boundaries.cjs`](../tools/check-boundaries.cjs): AST-based dependency analysis of JS/TS source, declaration files, literal imports/re-exports, import-equals, require/dynamic import, and TypeScript path aliases. It checks module ownership, public APIs, shared purity, layered imports, cycles, static asset/JSON ownership, and transitive CSS/Sass/Less imports, URL and quoted image-set() ownership with the same layer-direction checks as source code.
- [`tools/check-boundaries.test.cjs`](../tools/check-boundaries.test.cjs): positive and negative fixtures for the above boundaries, including pure-layer dependencies, module modes and migrations, source symlinks, shared code, JavaScript public APIs and local assets.
- [`tools/validate-docs.cjs`](../tools/validate-docs.cjs) and [its tests](../tools/validate-docs.test.cjs): Markdown code-fence and local-link validation.
- [React reference app](../examples/react-app/README.md): Vite, React, TanStack Router/Query, simple catalog (including loading/error/empty/retry states) and layered orders capabilities, in-memory persistence, and service-specific Query keys. Checkout has structured validation, accessible labels, a shared in-flight guard and deferred-promise retry tests.
- [TypeScript orders example](../examples/orders/README.md): dependency inversion with application-owned ports.
- [Agent instructions](../agents/react-architecture/AGENTS.snippet.md): a copy-ready guide for consumer repositories.

## How to validate

Requires Node and npm registry access. Authentic package lockfiles are committed in the root, `examples/orders` and `examples/react-app`:

```sh
npm ci
npm --prefix examples/orders ci
npm --prefix examples/react-app ci
npm run verify
npm audit
npm --prefix examples/orders audit
npm --prefix examples/react-app audit
```

`npm run verify` runs Markdown tests, architecture fixtures, TypeScript orders checks, and the React app's ESLint React Hooks/JSX accessibility checks, tests, boundary check, typecheck and Vite production build. Browser smoke tests should also cover navigation, accessible form validation, pending saves, failed saves, retry, and product switches.

**Verification status for PR #1 (2026-10-26):** CR-P1-011's local installation and verification blocker is resolved. Registry-generated lockfiles, three clean installs, the complete local gate, three zero-finding audits, repeat production builds and bounded dev/preview browser checks are recorded in [verification evidence](verification.md). This does not establish exhaustive bundler conformance or a screen-reader audit, and does not authorize merging.

## Boundaries and limitations

The checker reads the consuming project's `tsconfig.json` and optionally `architecture.config.json`. Vite glob calls and computed dynamic imports fail closed; local worker and asset URLs are checked against source ownership; Vite asset query suffixes are separated from physical filenames; Vite aliases must be mirrored as inspectable, matching paths in `viteAliases` without trailing-slash alias keys, and root-absolute imports are treated as owned project imports. It accepts owned JSON configuration imports; pure layers cannot import presentation assets. Source-file symlinks are checked against canonical physical paths, and modules mixing simple/complex layer modes require a justified `allowMixedLayouts` migration exception. Paths resolving outside the scanned `src/` are reported as unverified rather than silently accepted. Read [dependency rules](dependency-rules.md) for approved external pure packages and one-way module API exceptions.

Unverifiable computed imports are rejected, but arbitrary plugin-injected aliases, advanced transformations and semantic use of ambient globals cannot be proved by this static analysis. The checker is not a security sandbox or replacement for a compiler, exhaustive dependency analyzer, browser validation, supply-chain audit, or backend authorization.

The React app stores orders in memory and performs UI-level single-flight guarding only. **Real order creation requires trusted server validation, authorization and idempotency.** For SSR, instantiate services and Query clients with request-appropriate scope.

No additional GitHub Actions workflows were added solely for this guide. Existing consumers should integrate necessary architecture rules into their established local/CI gates, batching changes and checks to conserve Actions minutes.

## Historical remediation notes

The notes below record earlier revisions and their then-current limitations. Their repeated registry/lockfile blockers are superseded by the dated [verification record](verification.md); they are not the current verification status.

### Additional conformance regression coverage

Architecture fixture tests now include bare `baseUrl` imports resolving beyond `src/`, shadowed Vite URL helper identifiers, and overlapping TypeScript asset aliases in both JavaScript and stylesheets. The stylesheet scanner includes escaped CSS-string and hexadecimal-escape cases. Markdown link validation covers balanced parentheses, angle-bracket destinations with spaces, reference definitions, and local images.

These source-level tests do **not** replace the required registry-backed lockfiles, clean installation, complete architecture/React suite, browser build and smoke test, or dependency audit. The PR must remain draft while those requirements cannot be verified.


### Latest remediation: pure-source and documentation validation

The boundary checker now fail-closes on arbitrary top-level directories imported from pure layers, and distinguishes unmodified JSON data from `?raw`, `?url`, `?worker`, other query modes and `new URL()` assets. Regression fixtures explicitly contain their Vite `node:url` import instead of modifying Vite configuration at setup time. Markdown link validation ignores HTML comments (including multiline comments) and indented code blocks while preserving detection of active links.

Targeted source-level policy/import-mode probes and the documentation fixture suite were exercised without the npm registry. Full installation, full architecture fixture execution, React production build, browser verification, and audits **remain pending** until authentic lockfiles and dependency access are available. Do not infer merge readiness from targeted tests alone.

### Vite config and Markdown block review remediation

This revision adds explicit default CommonJS Vite configuration discovery, conservative static `module.exports` support, checked custom `--config` selections in npm scripts, protection from configuration symlinks outside the project, and file-URL-correct alias verification for percent-encoded dot segments and spaces. New regression fixtures cover unmirrored CommonJS aliases, custom scripts, mixed config choices, encoded aliases and negative cases.

Markdown validation now distinguishes raw HTML blocks (including script/pre-style raw-text blocks) and blockquoted fenced code from active Markdown links, while continuing to validate links after these blocks. Parser tests cover these contexts without introducing dependencies solely for validation.

Full `npm ci` verification, complete suites and audits remain **unverified** until registry access and authentic lockfiles are available. The PR remains draft and unmerged.

### Follow-up review remediation: executable configuration and Markdown containers

Addressed four later review findings: potential Vite alias mutation through top-level CommonJS variable initializers; cross-command `--config` flags mistakenly attributed to Vite; inline-code comment delimiters incorrectly hiding real Markdown links; and inconsistent unclosed or list-contained fenced-code handling. Added negative and positive regression fixtures. JavaScript syntax checks, 13 targeted Vite command-selection probes, and the full Markdown fixture set (36 test definitions) were performed using available tools; these are **not equivalent to a successful full npm-installed test run**.

This change deliberately rejects additional executable CommonJS top-level statements rather than pretending to evaluate their side effects. The npm-script scanner scopes `--config` to the identified Vite command. The Markdown checker masks inline code before HTML-comment detection and handles simple nested list/blockquote fence contexts.

Authentic package lockfiles, registry-backed `npm ci`, complete root `npm run verify`, dependency audits, a real Vite build and browser smoke tests remain mandatory before the PR can leave draft status.

### Review remediation: effective Vite configuration and Markdown comment state

The latest review found four more edge cases: misleading `vite` tokens/wrong project working directory, ignored `-c` config options, escaped or misprioritized HTML comment delimiters, and indented code opening phantom comments. The checker now parses recognized Vite command tokens and options rather than matching incidental words, rejects cwd changes and positional roots, and requires `-c` configurations to be mirrored just like `--config`. The Markdown scanner respects escapes, active-comment closure precedence and indented code blocks.

Adversarial tests cover both expected failures and valid common forms, including direct Vite binary invocations, short/long config flags, quoted shell separators, and the previous false-negative Markdown examples. The test count and targeted results do not replace a complete installed test run; genuine lockfiles, `npm ci`, full verification, audits, real Vite build and browser smoke testing are still pending.

### Most recent review remediation: opaque shell launches and link metadata

The three confirmed findings in review #5627969083 were addressed: hidden Vite builds inside nested shell interpreters now fail closed; `<!--` in Markdown link destinations and titles no longer suppresses later active links; and valid `vite --host` invocations are accepted with or without a hostname. New adversarial tests cover shell interpreters and environment wrappers, ordinary compound build scripts, optional host flags, link metadata, actual HTML comments, and Unicode offset handling.

Targeted validation includes 50 Markdown fixture tests and Vite script-selection probes. These cannot replace full `npm ci`, complete TypeScript-backed architecture tests, React build, dependency security audits or browser verification. Maintain the draft status until authentic lockfiles and those real integration gates are available and successfully executed.

### Trusted Vite helpers and explicit build entrypoints

The Vite config checker now accepts the `defineConfig({ ... })` wrapper only when `defineConfig` is an unaliased runtime import from `vite` or `vitest/config`. A locally defined or unrelated helper, and additional executable ESM top-level declarations, fail closed because they could mutate an otherwise static alias map. Recognized `build`, `dev`, `start`, `serve`, `preview`, `bundle` and `watch` entrypoints must expose a supported Vite invocation directly; opaque `node`/`tsx`/other external build runners and arbitrary npm-script delegation fail closed. The documented reference `npm run arch && tsc --noEmit && vite build` remains supported. These are conservative static restrictions, not limitations of Vite; dynamic configs and plugins require independent real-build validation.

Markdown reference-definition destinations and quoted titles now receive the same HTML-comment protection as inline links. An apparent `<!--` inside a valid reference title cannot hide subsequent broken links, and the reference destination is still checked. The lightweight scanner is not a complete CommonMark parser.

### Remediation of review #5629420121 — npm hooks and Markdown block/inline precedence

Three issues were corrected together: delegated `arch` commands cannot append an opaque builder or hide one in `prearch`/`postarch` hooks; npm build/dev lifecycle hooks (including namespaced pre/post entries) receive the same fail-closed Vite command checks; and multiline Markdown reference titles and image labels no longer create phantom HTML comments that hide active links. Tests cover rejected chained/piped/redirection commands, safe direct Vite and checker scripts, lifecycle hooks, image destinations, multiline titles and Unicode labels.

Locally executed staged checks included 62 Markdown fixtures, 23 Vite-selection probes, and JavaScript syntax verification. These targeted checks must not be presented as a full verified build. Authenticate package lockfiles, run clean installs, the full architecture/React verification suite, npm audits, actual Vite conformance and browser accessibility smoke tests before merging. Keep this PR draft while those gates are blocked.

### Review #5629951399 remediation — executable CommonJS dependencies and Markdown references

This batched remediation closes three findings: the TypeScript walker includes literal Node `module.require` calls as runtime import edges and rejects computed, detached and factory-style loaders it cannot statically resolve; npm `pre*`/`post*` hooks for scripts such as `verify`, `test` and namespaced build commands are checked as possible opaque builders; and reference-style Markdown image/link labels no longer open phantom `<!--` HTML comments.

Adversarial regression tests cover shared-module ownership, CommonJS runtime cycles, dynamic module loaders, trusted literal imports, verification/test lifecycle hooks, full/collapsed/shortcut reference labels, missing image targets, Unicode and real HTML comments. Focused probes supplement rather than replace the unexecuted full project suites. Preserve draft status until genuine npm lockfiles, clean installs, integration/build/audit gates and browser accessibility checks have passed. Consider adopting a proven CommonMark parser when dependency installation and lockfile regeneration are available; avoid claiming this handwritten scanner implements the full grammar.

### Latest review remediation: loader bindings, reachable npm scripts and nested Markdown labels

Fixes for comprehensive review #5630432793 are batched as one changeset. Bare aliases of Node's `require` or `module` identifiers now fail closed instead of silently escaping the CommonJS import graph. The npm/Vite checker models reachable test and verification entrypoints, follows nested npm script calls and lifecycle hooks, and rejects opaque builders, unknown targets and delegation cycles. The Markdown comment filter uses an escape-aware balanced-bracket scanner, recognizing nested and escaped labels while allowing real comments outside valid links.

Adversarial fixtures cover aliased loaders, safe direct CommonJS controls, opaque `verify`/`test` and delegated scripts, lifecycle-hook reachability, cycles, nested/escaped link labels, genuine unmatched-comment cases, and safe reference-app commands. The isolated fixture and script-selection probes are not a substitute for full dependency-backed architecture/React tests, real Vite execution, npm audits and browser/accessibility checks. Preserve draft/unmerged status until all required quality and security gates pass. Keep future changes batched to conserve GitHub Actions minutes.

### Review #5635498895 remediation — forwarded npm args, alternate loader and nested links

Three confirmed findings were fixed in one batch: (1) npm delegation now rejects forwarded `--` arguments, workspace/prefix flags and script-scope changes that could silently select a different Vite config; (2) deprecated `process.mainModule` loader access is explicitly unsupported so its executed imports cannot escape the dependency graph; (3) escaped and nested Markdown link labels use the same bracket parser for link extraction as for comment masking. Regression fixtures cover forwarded configuration flags, workspace selections, nested delegation, safe default scripts, alternate loader forms, nested images and links, and valid nested-label controls.

Targeted JS fixture and AST probes are not equivalent to the unexecuted full architecture/React suites. Continue to require authentic npm lockfiles, clean installs, dependency audits, actual Vite build conformance and browser accessibility tests before promoting or merging this draft PR. Preserve GitHub Actions minutes through batched local validation and one coordinated push.

### Review #5635584673 remediation — test launchers, AST fields and Markdown blocks

The four reported issues were addressed together. npm static execution checks now reject test-runner executable preload/configuration flags while continuing to support the documented `vitest run` and narrow `node --test` invocations. The TypeScript walker exempts declaration keys named `module` or `require` from CommonJS loader checks without allowing runtime loader aliases. Markdown masking now recognizes cross-line code spans; reference pre-indexing skips fenced/indented code and HTML-comment blocks.

Added regression fixtures for Node preload flags, alternative Vitest config, legitimate TypeScript DTO/class/method/enum/parameter declaration names and continued loader-alias rejection, multiline code spans and fake reference definitions in code/HTML blocks. These are local targeted checks, not substitutes for installed architecture+React suites, registry-based dependency audits, real Vite bundler configuration verification or browser accessibility tests. Keep the PR draft and batch pushes to conserve GitHub Actions minutes until all mandatory quality/security gates pass.

### Review #5635804882 remediation: HTML block precedence and local names

This batch addresses three P2 findings from the latest comprehensive review: a backtick inside a real HTML comment no longer closes a preceding code span; raw HTML blocks no longer supply spurious reference definitions; and harmless destructuring keys plus typed local values/parameters named `module` or `require` no longer trigger CommonJS loader errors. Lexical shadowing remains fail-closed for untyped/dynamic loader values. Regression fixtures cover `div`/`script`/`pre`, valid definitions after HTML, literal code spans, HTML-comment precedence, ordinary domain vocabulary, and retained unsupported-loader checks. One pre-existing Markdown test expectation was corrected using a CommonMark renderer.

These are targeted static regression checks, not evidence that the full 200+ test TypeScript architecture suite, React test/build pipeline, npm audits or browser/accessibility reviews have run. Keep draft/unmerged status until authentic lockfiles, clean installs, full tests, security scans and real bundler verification are available. Continue batching local changes before pushing to minimize GitHub Actions usage.

### Review #5636101157 remediation: escaped identifiers, Vite plugins, fenced Markdown, orders

Four findings were batched: escaped CSS dependency identifiers now fail closed; configured Vite aliases paired with executable plugins cannot claim static effective-alias verification; Markdown fences are recognized before info strings can open phantom HTML comments; and root verification now includes the standalone orders source in the architecture check. Regression tests cover escaped CSS directives/functions and quoted values, plugin override attempts and empty arrays, fence/comment precedence, and orders check-script wiring.

The CSS and Markdown fixture suites were run against the staged source in an isolated in-memory JavaScript filesystem harness (17 and 92 cases, respectively). The architecture TypeScript fixture suite and genuine npm-backed React/orders checks, complete installations/audits and browser checks were not executable due to DNS resolution failures for the npm registry. All three authentic lockfiles are still pending. Keep draft/unmerged status until the complete release gates pass.

### Review #5636325323 remediation — plugin aliases, entrypoint scope and Markdown references

This coordinated batch addresses three new findings: (1) plugins that inject aliases with no static alias map fail closed, with only a narrowly pinned React plugin exception for the reference application; (2) custom Vite roots/build inputs/multi-environment entrypoints and HTML entries outside the inspected source graph are rejected; and (3) multiline Markdown inline-code spans can no longer supply pseudo-reference definitions. Negative and safe-control regression fixtures were added.

The Markdown suite passed 94/94 cases using the committed-source-equivalent JavaScript implementation and an isolated mock filesystem. JavaScript syntax of all new checker/test source was validated. Architecture fixtures depend on a real TypeScript runtime and the complete npm-backed build/test/audit/browser gates remain **unverified** because registry DNS access and authentic lockfiles are unavailable. Do not merge or change draft status before full release validation; push findings as one batch to conserve Actions minutes.

### Review #5636476418 remediation — Vite transforms and inline HTML

Three findings were batched as one coherent fix. Source-graph validation now rejects unsupported Vite `esbuild`/`css` transformer options that can prepend import edges; executable HTML event attributes and script-capable URLs cannot silently pass; and inline `<style>`/`style=` CSS cannot bypass checked stylesheet ownership. The HTML guard also fails closed on inline import maps and `srcdoc` instead of claiming that script `src` validation proves the full runtime HTML graph.

Added architecture regression fixtures for transform injections, dynamic options, harmless empty/disabled forms, event handlers, inline style imports/URL assets, encoded JavaScript URLs, import maps, inert JSON, comments, ordinary attributes and local linked CSS. **Focused validation only:** 17/17 direct HTML scanner cases and 8/8 isolated Vite option-guard probes passed; updated checker/test JavaScript syntax parsed. The TypeScript-backed full architecture fixtures, full React/orders build suites, registry-based `npm ci`, audits and browser/accessibility checks have not run in this environment. Genuine npm lockfiles remain absent; preserve DRAFT/UNMERGED until full validation.

### Review #5636660964 remediation: HTML parser, public-directory and static asset edges

Four findings were addressed in one batched implementation: browser HTML5 comment/RCDATA semantics are parsed with pinned `parse5`; the default Vite `public/` tree is audited with an inert-file allowlist and no symlink exceptions; local HTML `src`/`srcset`/icon/media/style/module paths now resolve to real owned files; and quoted `>` in safe script attributes is correctly interpreted by the same tokenizer. HTML iframes, objects, active inline scripts/styles, malformed URL candidates and other unsupported executable content fail closed. Regression fixtures cover all four cases plus safe controls.

The new parser dependency has been pinned in the root package manifest, and the HTML suite is included in `npm run test:architecture`. Authentic lockfiles and registry-backed package installation remain unavailable, so **do not claim that the full fixture suite, Vite build, dependency audits or browser/a11y checks passed**. Run all documented release gates, retain the PR in DRAFT and avoid repeated CI-triggering pushes.

### Review #5636724781 remediation — existing tests, workers, HTML metadata and dev pages

Four review findings were addressed as one batched changeset: existing pre-parse5 fixture expectations now use the new precise `outside-source-html-import` error code while retaining unsupported-script cases; Vite `worker` configuration is fail-closed except for a literal empty object; responsive `link.imagesrcset` plus Vite-recognized `meta.content` image/media variants are checked for file ownership; and extra HTML documents in the Vite root are rejected unless an explicit multi-page verification policy is introduced. Regression fixtures include the new error expectations, worker-specific plugin/entrypoint settings, resource metadata and responsive candidates, sibling/nested HTML files, inert controls and excluded output directories.

The staged modified JavaScript parsed, and **14/14 targeted mock/in-memory probes passed**, including Vite worker guard, secondary-page discovery, parser-node resource extraction and diagnostic consistency. These probes are not a replacement for running the installed TypeScript and parse5 architecture suites. All three authentic npm lockfiles, clean npm installs, complete React/orders tests/builds, audits, real Vite main/worker module graphs and browser/accessibility checks remain outstanding. Maintain DRAFT/UNMERGED and batch GitHub pushes to minimize Actions consumption.

### Review #5636815429 — nested entrypoints, stylesheet sources and symlink resilience

The three reported issues have been addressed together: secondary HTML scanning applies exclusions only at the Vite project root; active external/data CSS entrypoint URLs fail closed (while local CSS dependencies and remote decorative media remain supported); and inaccessible/dangling symlinks produce controlled diagnostics instead of throwing. Added regression fixtures for nested names that overlap root exclusions, the allowed root/vendor controls, valid/nonvalid symlinks, remote/data stylesheet and style-preload links, local stylesheet references and remote media controls.

Focused in-memory/source probes on the staged implementation passed **17/17** checks. Syntax validation succeeded for modified JavaScript sources and tests. These probes are not a substitute for `npm run verify`, actual Vite/browser and security checks. Authentic npm lockfiles and dependency-backed execution remain outstanding, so retain the PR in DRAFT/UNMERGED until all mandatory quality gates pass.

### Review #5636876210 remediation — publicDir disabled, remote CSS and dangling links

All three review findings have been addressed in one batch: `publicDir:false` no longer hides dev-servable root `public/` HTML; local CSS/SCSS active remote/data stylesheet directives fail closed while inert external media and Sass built-ins remain supported; and broken TypeScript/CSS symlinks yield structured diagnostics. The obsolete regression claiming `publicDir:false` makes `public/unused.html` safe has been replaced with correct negative and inert controls. New fixtures test both invalid and valid file links.

Modified JavaScript passed syntax parsing and 16/16 focused isolated checks of the changed paths passed. Isolated checks do not establish the entire npm-backed architecture suite, real Vite dev-server behavior, npm audits, React/orders tests, build or browser accessibility checks. Those requirements and the authentic npm lockfiles remain outstanding; the PR must stay DRAFT/UNMERGED.

### Review #5636952721 remediation — bounded frey-skills pass

**Ledger:** R1 [P1, owned source/CSS discovery], R2 [P1, Vite-served root output HTML], and R3 [P2, disabled-public active assets]. `BlizzardBlast/frey-skills` `iterative-self-review` was used as the remediation process: inspect the current review and PR head, preserve unrelated work, batch related fixes, add negative and safe-control fixtures, test relevant counterexamples, and avoid unnecessary CI-triggering pushes.

- R1: remove basename-based exclusions inside the owned `src/` tree for both TypeScript and stylesheets; include nested `dist/coverage/build/node_modules` source and transitive CSS dependency cases.
- R2: audit/reject extra HTML even when stored under root generated-output-looking folders; keep only documented third-party/Git metadata exceptions. Include root `dist/build/coverage/.next/.vite` HTML cases and a real-vendor root control.
- R3: continue the public-asset allowlist audit with `publicDir:false` (while handling its HTML through secondary-page discovery); add JS/CSS/SVG and inert raster/font fixtures.

**Observed local evidence:** Staged checker/test JavaScript syntax parsed successfully; 20/20 isolated checks of discovery, ownership and HTML/public behavior passed. These isolate the changed decision paths but are **not** the installed TypeScript/parse5 test suite. Authentic root/orders/React lockfiles, `npm ci`, full tests, audits, actual Vite dev/build requests and browser/accessibility checks remain NOT RUN. The PR remains DRAFT/UNMERGED; full release-gate results must be recorded before promotion.

### CR-P1-001 and CR-P1-002 remediation — frey-skills ledger pass

Two current P1 review findings were remediated together using `frey-skills/iterative-self-review` (current-head confirmation, affected invariants, adjacent boundary controls, scoped self-review, one batch). CR-P1-001 replaces path-substring external-package inference with an actual bare-specifier, TypeScript external-library, importer-ancestor `node_modules` classification; relative/aliased/baseUrl paths into arbitrary vendor package-looking folders can no longer silently escape the first-party graph. CR-P1-002 moves the native React build output outside Vite's served project root and uses Vite's supported `--emptyOutDir` option for deterministic rebuilds. The checker still rejects unverified HTML under root `dist/` and `build/`.

Negative and positive regression fixtures cover the original bypass and related cases, genuine installed bare imports, owned files in nested `node_modules`, output-location contract, repeat architecture verification with generated output outside the root, and unexpected HTML within the root. Focused function and genuine TypeScript resolver probes were executed against these changed invariants; no full npm-backed architecture suite or actual consecutive Vite builds were executed. Authentic lockfiles, complete tests, supply-chain audits, real Vite dev/build behavior and browser accessibility remain outstanding. Do not advance this draft PR without those quality gates.

### Frey-skills remediation CR-P1-003 (linked workspace packages)

**Baseline:** `e1469daf46546377d5d2800e6e468856ea19da6d`, PR #1 `docs/m1-executable-architecture`, draft/unmerged. `BASELINE_LIMITED` — GitHub's committed head was available, but the repository could not be cloned to inspect uncommitted state or run the complete npm suite. **Pass 1:** a resolved package is now exempt only when its TypeScript external-library metadata, bare specifier, importer-ancestor installed path (`originalPath` for default symlink resolution), and matching physical target all agree. Added actual symlink fixtures for both `preserveSymlinks` modes, a scoped workspace package, and a forbidden project-alias case. The original relative, baseUrl, and first-party controls remain. Local TypeScript **5.8.3** filesystem/resolution probes passed **8/8**; the repository pins TypeScript **5.9.3**, which has not been executed because registry access is unavailable. Modified checker/test JavaScript syntax was also checked.

**Still required:** npm registry-backed installs and authentic lockfiles for each package, complete architecture tests on pinned TypeScript/parse5, React and orders suites, two actual Vite builds, dependency audits and browser/accessibility verification. These are not evidenced by focused probes and the PR must remain draft until all required checks pass. The `frey-skills/iterative-self-review` process was applied as a bounded ledger remediation, not as a new full-repository approval.

### frey-skills remediation ledger — CR-P1-004 and CR-P2-005

**Baseline:** PR #1 `docs/m1-executable-architecture` at `d9e4a65a168391331417a401a5f76ccfad1ffd1a`, draft and unmerged. **BASELINE_LIMITED:** GitHub source was available, but local Git state, project `parse5` and npm-installed app dependencies were unavailable; no full test-suite baseline can be claimed.

- **CR-P1-004 (P1):** Bare CSS/SCSS/Sass/Less package imports no longer fall through the TypeScript module resolver's unresolved-bare-import branch. They fail closed as `unverified-package-stylesheet` while package JS and explicitly owned local CSS continue to work. Regression fixtures exercise installed CSS with remote transitive imports, CSS modules, Sass, Less, queries, pure-layer assets, and safe local/aliased controls.
- **CR-P2-005 (P2):** Pure-layer package restrictions now inspect whether the resolved JS/TS target is in the known owned-source set before classifying it as external. Pure local `baseUrl` imports pass, forbidden internal layers continue to fail, and real packages remain governed by the pure-package allowlist. Regression fixtures exercise each contrast.

**Focused evidence:** Staged JavaScript syntax and 15 focused exact-branch classification probes passed; TypeScript 5.8.3 actual filesystem resolution confirms that bare installed CSS has no resolved module, local `baseUrl` resolves to first-party TS with `isExternalLibraryImport:false`, and ordinary JS packages resolve as external. The repository pins TypeScript 5.9.3. The new complete architecture test groups and full pinned-dependency environment remain unexecuted; these focused probes are not equivalent to npm-backed suite, Vite build/preview, browser or audit results.

**Remaining release gates:** authentic root/orders/React npm lockfiles (currently 0/3), full `npm ci` + `npm run verify`, vulnerability audits, two successive Vite builds and runtime/keyboard/accessibility checks. Keep PR DRAFT/UNMERGED until they pass. Preserve Actions-minimizing batched pushes without weakening required quality/security checks.

### CR-P1-006: extensionless exported stylesheets — bounded frey-skills pass

**Baseline:** `44dc1487d114e5c549b98e0ef9b7d27049b713df`, PR #1 `docs/m1-executable-architecture`, draft/unmerged. **BASELINE_LIMITED:** remote tracked files were inspectable, but the local project checkout and full dependency-backed CI test environment were not.

**Finding:** Vite can resolve `import "ui-kit/theme"` or a package root to CSS using the package `exports` map, including conditional targets. The previous suffix-only check and TypeScript JS/TS resolver let these active stylesheet imports disappear. Stylus explicit imports were similarly omitted.

**Pass 1:** added conservative manifest-export target classification (root/subpath, scoped/wildcard, conditional `types` vs `import`, arrays and legacy package entry fields), `.styl` and `.stylus` recognition, and a fail-closed diagnostic for otherwise unresolved bare runtime imports. Preserved real JS dependency resolution, first-party alias handling and test-only import controls. Eight architecture fixture groups exercise the original and related cases. The staged helper passed 17/17 synthetic manifest cases; independent TypeScript 5.8.3 filesystem tests demonstrated root CSS unresolved, conditional CSS resolving only to a `.d.ts`, and unavailable CSS modules. These are focused tests and **not** the repository's pinned TypeScript 5.9.3 / parse5-backed architecture suite.

**Still outstanding:** 0/3 authentic lockfiles, dependency installation and complete root/React/orders tests, two actual Vite builds, actual package export conformance in the bundler, npm audits, and browser/accessibility checks. No new CI workflow or needless remote pushes were added; keep draft/unmerged until real validation passes.


### Remediation scope: executable configuration and package style mappings

The boundary checker now fails closed on shell expansion/redirection in entrypoint/Vite scripts, arbitrary runtime imports and unknown executable properties in Vite configs, package self-exports and `#imports` pointing to stylesheet targets, and automatically discovered PostCSS config. Negative controls and benign configurations have regression fixtures. This is static protection only: none of these checks replace actual Vite/TypeScript integration validation.

**Merge blockers remain until objectively verified:** registry-generated and committed lockfiles for the root, orders and React examples; exact pinned dependency installations, complete tests and audits; two actual Vite builds and preview; browser/accessibility checks and the repository's required security/review gates. Do not treat isolated source probes or absent GitHub Actions statuses as passing these gates.

### Scoped remediation: package resolution and CSS lexical boundaries

CR-P1-012: executable `#imports` and self-package `exports` mappings are now inspected independently of TypeScript `paths` aliases and followed through chained aliases or installed package CSS exports. Query-qualified `#name?raw` references preserve the actual package-map key. CR-P2-013: the raw CSS scanner requires complete function identifiers, avoiding false dependency reports from similarly named custom functions. CR-P2-014: erased `import type` references do not generate executable CSS diagnostics, while runtime-preserved inline type imports remain audited. Regression fixtures cover forbidden edges and benign controls.

**Required release validation remains BLOCKED:** the pinned dependency graph and three authentic lockfiles are unavailable in the current authoring environment; complete architecture/React/orders test suites, audits, two actual Vite builds and browser/a11y checks are not verified. No CI checks were weakened or skipped as an alternative to those gates.

### CR-P1-015 and CR-P1-016 — runtime JavaScript mapping and Stylus discovery

The architecture checker now verifies runtime JavaScript targets of package `#imports` and self-name `exports` mappings separately from TypeScript `paths` or `types` resolution. It checks owned source paths, module boundaries, runtime graph edges, and conditional/wildcard mapping alternatives; unverifiable targets fail closed. Stylus `.styl` and `.stylus` files are discovered and deliberately rejected until actual transitive preprocessing semantics can be independently audited. Regression fixtures cover original bypasses, valid JavaScript mappings, erased type-only imports, cycles, HTML Stylus entrypoints, and unrelated installed packages.

**CR-P1-011 remains blocked:** authentic registry-resolved lockfiles, pinned installed project tests, two actual Vite builds, npm audits, and browser/accessibility smoke checks require dependencies unavailable in the authoring environment. GitHub Actions quota conservation never substitutes for the required security and release validation. Keep this PR draft/unmerged until verified.

### CR-P1-017 and CR-P2-018 — asset query semantics and active-branch cycles

Package-mapped Vite data imports (`?raw` and `?url`) are now treated as assets for architecture ownership/purity and excluded from executable cycle edges, while ordinary code and worker imports retain runtime edges. Import-map recursion detection now tracks only the currently active branch so repeated safe conditions do not trigger false cycle diagnostics, preserving true recursion rejections. New regression fixtures cover both findings, including TypeScript paths controls, same-owner assets, cross-owner assets, real worker cycles, repeated safe self-package export targets, invalid nested #imports redirects and recursive mappings.

**Release validation (CR-P1-011) remains BLOCKED:** no authentic registry-backed lockfiles are committed, and full project installs/tests, Vite builds, dependency audits and browser/accessibility checks have not been verified. In this authoring environment, registry resolution fails with `EAI_AGAIN`; do not treat focused probes as full checks or promote the draft to merge ready.

### CR-P1-019 — installed package shadows a TypeScript-only source alias

For executable bare imports, the checker now distinguishes a TypeScript-owned source target from an installed package that Vite could select instead. Where a genuine installed package directory shadows a TS `paths` or `baseUrl` resolution into `src/` and there is no verified Vite alias, CSS package exports fail as `unverified-package-stylesheet` and other package targets fail as `unverified-package-runtime-mapping`. Explicitly verified Vite aliases continue to override installed packages. The new fixtures include scoped packages, JS/CSS targets, legacy manifestless packages, erased type imports, unshadowed TS imports and a broad wildcard that correctly resolves an external package. This is a fail-closed static safeguard, not proof of Vite's complete effective dependency graph.

**CR-P1-011 remains BLOCKED:** genuine root/orders/React lockfiles and pinned `npm ci`, complete test suites, npm audits, actual Vite builds/preview and browser/a11y checks are still not verified. npm registry DNS fails with `EAI_AGAIN` in this environment. Keep PR draft; do not equate isolated checks with release readiness.

### CR-P1-020 — executable source imports with asset-inlining modifiers

Vite `?inline` and `?no-inline` only modify asset inlining. They are not standalone data loaders for TypeScript or JavaScript modules, so the architecture checker now preserves their runtime-cycle edges and permits otherwise-valid pure source imports. In contrast `?raw` and `?url` remain data-loading modes, while `?worker` remains executable. Stylesheets/images with inline modifiers stay classified as assets. Regression fixtures include relative TS/JS imports, nearest-package import maps, self-name exports, audited Vite aliases, both pure-layer and runtime-cycle outcomes, CSS/image controls, compound data loaders and worker entrypoints. Unknown query syntax is not assumed harmless, and real Vite resolved-build verification is still required.

**CR-P1-011 remains blocked:** the npm registry is unreachable (`EAI_AGAIN`), so authentic root/orders/React lockfiles cannot be created in this environment, and pinned installs, full tests, audits, repeated production builds, preview and browser accessibility verification cannot be attested. This PR stays draft until all required gates genuinely pass.

### CR-P1-021 and CR-P1-022: runtime provenance and Vite query grammar

CR-P1-021: a matching TypeScript `paths` pattern (including `"*"`) or heuristic `baseUrl` prefix no longer automatically declares an imported module first-party. A real installed dependency is classified as external only if the configured TypeScript resolution and the importer's unaliased `node_modules` resolution agree on the same installed file with valid provenance. First-party and intentionally redirected sources retain ownership checks, and installed-package collisions with genuine owned aliases still fail closed.

CR-P1-022: query recognition now follows Vite 7.3.7's exact complete-token patterns for `raw`, `url`, `worker`, and `sharedworker`. Assigned values such as `?raw=true` and `?url=1` cannot suppress executable source cycle edges; unsupported queries additionally fail closed with `unverified-vite-import-query`. Source dependencies also retain public-barrel and layer checks, instead of being misclassified as assets. Supported genuine data, worker, inline-modifier and CSS/image cases remain covered.

**CR-P1-011 continues to block release:** registry DNS resolution is unavailable (`EAI_AGAIN`), so genuine lockfiles, pinned `npm ci` installs, the full architecture/React/orders test suites, audits, real Vite builds/previews and browser accessibility verification remain unexecuted. Keep this PR in draft; these checks cannot be claimed to pass on source-level validation alone.

### CR-P1-023 — arbitrary baseUrl source and asset ownership

Do not classify first-party TypeScript `baseUrl` imports from a hard-coded list of prefix names. The checker now consults the actual TypeScript module resolution for all non-relative specifiers and confirms that local files belong to the enumerated checked source tree. CSS/image/JSON assets that TypeScript cannot type-resolve use an existing, physically source-contained baseUrl candidate. Installed same-name packages must still be checked for stylesheet/executable runtime shadowing unless an audited Vite alias takes precedence. This ensures pure layers cannot import raw/URL-transformed source or baseUrl CSS assets while preserving regular permitted source imports, type-only dependencies, verified Vite aliases and genuinely external package fallbacks. Dedicated fixtures cover root and nested names, scoped/subpath shadows, real source vs raw/UI/pure behavior, explicit styles, erased type imports, noncolliding package resolutions, and Node `#imports`/self-package raw/URL controls that retain their separate runtime mapping semantics.

**Release blocker CR-P1-011:** The execution environment still cannot resolve the npm registry (`EAI_AGAIN`); 0/3 authentic lockfiles and no verified pinned clean installs, full suites, audits, repeated Vite builds or browser/accessibility checks. Keep the PR draft and unmerged until these checks genuinely run and pass.

### CR-P1-024/025: extensionless asset resolution and runtime alias verification

Source-level Vite data imports such as `./config?raw`, `./config?url`, and mapped `@data/config?raw` may resolve to `config.ts` without an explicitly written extension. The local asset branch now resolves concrete candidates in Vite's default extension order and accepts an owned TypeScript source-resolution fallback, preserving physical ownership checks, pure-layer asset restrictions, and executable worker edges. A missing real source still fails. No claimed support for arbitrary dynamic plugins or opaque resolver extensions is implied.

TypeScript path/baseUrl mappings are not Vite runtime aliases. A first-party resolved executable bare import without a corresponding verified Vite alias or valid audited Node package mapping now fails with `unverified-vite-runtime-alias`. Test expectations that formerly blessed unmirrored runtime aliases have been corrected; valid Vite alias fixtures remain supported, and erased type-only imports require no runtime mapping. These checks are independent of existing package-shadowing and pure-layer rules.

**CR-P1-011 remains blocked:** The current environment cannot resolve `registry.npmjs.org` (`EAI_AGAIN`) or clone from GitHub directly. Authentic lockfiles, pinned `npm ci` installations, the full architecture/orders/React suites, npm audits, repeated production Vite builds, preview and browser accessibility verification are still required before merge. Keep the PR draft.

The scoped recheck additionally preserves executable source behavior for extensionless `?inline`/`?no-inline` imports targeting owned JS/TS files, rather than misclassifying them as missing static assets.


### CR-P1-026 / CR-P1-027 / CR-P2-028 — scoped remediation

Executable local source imports now resolve actual Vite runtime files rather than TypeScript's type-resolution substitutes. Targeted fixture tests cover JS/TS collisions, runtime cycles and missing-JS TypeScript fallback; standalone resolver tests cover filenames and extension order. Unverifiable directory-package entries fail closed.

Less `@plugin` directives fail closed until preprocessing JavaScript dependencies can be audited. Markdown raw-text HTML now takes precedence over inline HTML comment syntax, preventing an embedded `<!--` from hiding active links after the raw-text block. Both changes have direct positive and negative regression cases.

**CR-P1-011 remains BLOCKED:** The npm registry is unreachable in the present environment. Authentic root/orders/React lockfiles, pinned installs, full suites, audits, Vite builds and browser/accessibility verification remain unavailable. Keep PR #1 draft and unmerged until the actual gates pass.

 
### CR-P2-029 — Less plugin directive detection must exclude URL values

The Less plugin guard now scans at-rule positions outside function parentheses, comments, and CSS strings. Unquoted asset URLs containing an `@plugin` path segment and Less variables named `@plugin` are not treated as executable plugin declarations; actual `@plugin` directives still fail closed. Added direct scanner tests for local/remote/data URLs, variables, nested functions, live directives, and integration fixtures for valid local assets and actual plugins.

**CR-P1-011 remains blocked:** registry access is unavailable, so authentic lockfiles, pinned clean installs, the complete architecture/React/orders suites, audits and browser verification remain required before merging.


### CR-P2-030 — Less variables and detached-ruleset calls

The Less plugin scanner now distinguishes executable `@plugin` imports from a variable named `@plugin` with optional whitespace or a comment before its colon, and from detached-ruleset calls such as `@plugin();`. The actual Less parser accepts whitespace in variable declarations and requires whitespace after the name for the executable plugin directive. Positive/negative scanner and architecture fixtures check both forms together, preserve prior URL handling and continue to fail closed on executable plugins.

**CR-P1-011 remains BLOCKED:** the npm registry cannot be resolved in this execution environment. Authentic three-project lockfiles, clean `npm ci` installations, full suites, audits, production Vite build/preview and browser accessibility checks must still be performed before merging.
