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

Requires Node, a working npm registry and authentic package lockfiles in the root, `examples/orders` and `examples/react-app`. Once lockfiles exist:

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

**Verification status for PR #1:** The authoring environment cannot resolve the npm registry. An authentic lockfile, clean install, full architecture suite, React/Vite/Vitest run and transitive vulnerability audit remain pending. Static source and Markdown inspection do **not** establish their success. Keep the PR in draft until these checks run successfully; do not fabricate dependency metadata.

## Boundaries and limitations

The checker reads the consuming project's `tsconfig.json` and optionally `architecture.config.json`. Vite glob calls and computed dynamic imports fail closed; local worker and asset URLs are checked against source ownership; Vite asset query suffixes are separated from physical filenames; Vite aliases must be mirrored as inspectable, matching paths in `viteAliases` without trailing-slash alias keys, and root-absolute imports are treated as owned project imports. It accepts owned JSON configuration imports; pure layers cannot import presentation assets. Source-file symlinks are checked against canonical physical paths, and modules mixing simple/complex layer modes require a justified `allowMixedLayouts` migration exception. Paths resolving outside the scanned `src/` are reported as unverified rather than silently accepted. Read [dependency rules](dependency-rules.md) for approved external pure packages and one-way module API exceptions.

Unverifiable computed imports are rejected, but arbitrary plugin-injected aliases, advanced transformations and semantic use of ambient globals cannot be proved by this static analysis. The checker is not a security sandbox or replacement for a compiler, exhaustive dependency analyzer, browser validation, supply-chain audit, or backend authorization.

The React app stores orders in memory and performs UI-level single-flight guarding only. **Real order creation requires trusted server validation, authorization and idempotency.** For SSR, instantiate services and Query clients with request-appropriate scope.

No additional GitHub Actions workflows were added solely for this guide. Existing consumers should integrate necessary architecture rules into their established local/CI gates, batching changes and checks to conserve Actions minutes.

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
