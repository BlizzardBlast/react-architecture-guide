# Dependency rules and ownership

Folder names express ownership; **import direction and contracts** make that ownership real. Use the [canonical architecture](architecture.md) to decide whether a module should be simple or complex.

## Global dependency boundaries

1. `shared/` never imports `modules/`, `routes/` or `app/`, including type-only imports and static assets.
2. A business module does not import sibling modules by default. Compose them in `routes/` or `app/`.
3. Approved one-way sibling exceptions must be declared in the consuming application's `architecture.config.json` and import only the destination module's public `index.*` entry point. They must be acyclic, including for type-only dependencies.
4. External consumers use module public APIs; internal files import directly rather than through their own module barrel. For JavaScript modules, public entry points and self-barrel restrictions apply to `index.js`, `index.jsx`, `index.mjs` and `index.cjs` as well as TS/TSX/MTS/CTS.
5. Modules never import routes or app composition. Routes don't import app setup.
6. Runtime cycles fail. Cycles spanning modules fail even if entirely type-only; purely internal type-only cycles are warnings for structural review.

Inline TypeScript types such as `import("./order").Order` and `typeof import("./order")` obey the same ownership rules, including in declaration files. They add source dependencies without executable cycle edges. Production files and HTML entrypoints cannot import `.test.*` or `.spec.*` source, even through type-only imports or package mappings; test-only dependency exemptions must remain confined to tests.

## Simple modules

| Importing layer | Allowed dependencies | Not allowed |
| --- | --- | --- |
| `model/` | Local model, pure shared utilities | UI, API, framework, generated DTOs |
| `api/` | Model and technical shared integration | UI, routes, app |
| `ui/` | Local model and API, generic shared UI | Concrete module-private siblings, app setup |
| Module `index.*` | Narrow documented exports | Accidental wildcard public surface |

## Complex modules

| Importing layer | Allowed dependencies | Not allowed |
| --- | --- | --- |
| `domain/` | Local domain and pure shared | Application, infrastructure, UI, HTTP, generated DTOs |
| `application/` | Local application/domain and pure shared | Concrete infrastructure, presentation, HTTP clients |
| `infrastructure/` | Local application/domain/infrastructure and generic technical shared | UI, routes, app |
| `ui/` | Local application/domain, generic shared UI | Concrete infrastructure |
| Module-local composition | Local ports and implementations | Arbitrary sibling-private imports |

`shared/lib/` and `shared/domain/` are intended to be pure and cannot import React, HTTP clients, generated DTOs or non-pure shared folders. External packages in pure code are rejected by default unless individually reviewed and allowed.

## JSON and static assets

CSS, SVG, fonts and images may be imported by presentation and app composition code, provided they exist and do not cross ownership boundaries. Pure domain/model/application/shared utilities cannot import presentation assets. JSON **can** be owned, pure configuration/data: it is allowed only when its location and import path respect the same module ownership and layer rules as source modules.

HTML resource paths and decorative CSS `url()`/`image-set()` paths are URL-decoded before ownership checks, matching Vite's asset handling. Encoded spaces, Unicode and ordinary path characters are supported. Malformed escapes, encoded controls/backslashes and residual reserved or double encodings fail closed as `unverified-asset-url`, because development and build resolution may differ. CSS `@import` specifiers retain literal filename resolution. At-rule names inside URL payloads are ordinary filename text.

Imports resolving outside the validated `src/` tree are reported as outside-source references rather than automatically trusted. A multi-package monorepo must validate its other package roots separately or adapt the checker with reviewed configuration; a successful single-root check does not validate all workspaces.

## Optional policy exceptions

Create `architecture.config.json` next to the consuming app's `tsconfig.json`:

```json
{
  "allowPureExternal": ["zod"],
  "allowCrossModule": {
    "payments": ["orders"]
  },
  "allowMixedLayouts": {
    "orders": "Temporary migration from model/api to domain/infrastructure; see issue #123"
  }
}
```

`allowPureExternal` lists explicitly reviewed pure third-party packages used in domain/model/application/pure shared code; it is **not** a blanket exemption for React or HTTP. The checker does not prove that an allowed external package is pure.

`allowCrossModule` only permits eligible UI, infrastructure, API and composition importers to consume sibling **public entry points**. Domain, model and application layers cannot depend on another business module's public barrel merely because an exception exists.

### Module layout enforcement and temporary migrations

Each module uses the simple `api/model/ui` shape or the complex `domain/application/infrastructure/ui` shape, not both. The checker infers the mode from the module's direct layer directories and rejects a module containing both simple-only (`api`, `model`) and complex-only (`domain`, `application`, `infrastructure`) layers.

For an incremental migration, `allowMixedLayouts` maps a module name to a **nonempty, reviewed justification**. It temporarily permits the coexistence of both layouts; it does **not** permit direct imports between simple-only and complex-only layers, unsafe public API exceptions, or cycles. Remove the exception once migration is complete.

### Symlinks and physical file ownership

Source-file symlinks are checked against their physical targets, not just their apparent paths. Aliases that point into a different module/layer, or outside the validated source root, are rejected. Same-owner aliases remain possible. Ownership enforcement applies to type-only and runtime imports.

### Vite imports and alias integrity

`import.meta.glob` and `import.meta.globEager` are **unsupported and fail closed** in the current checker. They are never silently treated as safe. Prefer explicit imports until auditable glob expansion is implemented, including for eager and lazy globs.

When a project defines Vite `resolve.alias` in `vite.config.ts`, mirror each literal alias name in `architecture.config.json` under `viteAliases`. Values are target paths relative to the app directory (the parent of `src/`). The checker compares mirrored paths against statically inspectable Vite targets and rejects mismatches or unverifiable computed aliases. Supported Vite forms are absolute target string literals and `fileURLToPath(new URL('./src/...', import.meta.url))`. Shorthand or computed `resolve`, configuration spreads, dynamic alias factories, regex/array aliases and imported configuration factories fail closed. An alias declared in `architecture.config.json` but missing from the Vite config is also a violation. The two maps must preserve alias order, because overlapping prefixes can otherwise resolve to different files. Trailing-slash alias keys such as `@/` are rejected because they do not use Vite/Rollup's exact-or-following-slash matching. Use the alias key `@` with imports starting `@/`. Plugin-created aliases are not inspected by this static checker; production builds should additionally validate the effective Vite resolver. Vite root-absolute `/src/...` paths are also checked against normal module ownership.

For example, in `vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
export default {
  resolve: {
    alias: { '@orders': fileURLToPath(new URL('./src/modules/orders', import.meta.url)) },
  },
};
```

Mirror its resolved target:

```json
{ "viteAliases": { "@orders": "src/modules/orders" } }
```

The checker does not execute the Vite config. Unverifiable dynamic configuration must be changed or explicitly integrated into a trusted module resolver; never silently bypass the architecture check. Alias targets cannot be used to evade shared or sibling module boundaries.

### Vite dynamic imports, worker modules and URL assets

Vite can compile variable dynamic `import()` expressions into module dependencies. The checker **fails closed** on nonliteral dynamic `import()` and computed `require()` rather than silently overlooking their edges. Replace them with reviewed explicit imports or implement a separate trusted enumeration policy.

For Vite's `new URL('./asset.ext', import.meta.url)` and `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` syntax, the checker records statically specified local URLs as dependencies. Both must pass ownership, pure-layer and cross-module checks. A standalone `new URL()` reference is not an executable source-module import and does not create a runtime-cycle edge; a `Worker` or `SharedWorker` entrypoint does. Dynamic URL targets fail closed. Generic external URLs are not treated as local source dependencies.

Vite import query suffixes such as `?url`, `?raw`, `?inline`, `?no-inline`, and `?worker` are removed **only for filesystem resolution**. The full import specifier is retained in diagnostics; query-modified worker/source entrypoints still participate in the runtime graph, while `?raw` and `?url` data imports do not create execution-cycle edges.

These AST rules cover documented syntax, not arbitrary plugin transformations or the complete bundler graph. For complex Vite customizations, independently inspect the production output and effective bundler configuration rather than claiming the source checker provides a full security boundary.

### Transitive stylesheet ownership

Stylesheets are also architectural dependency sources. The checker scans `src/**/*.css`, `*.scss`, `*.sass`, and `*.less`, including stylesheets that are referenced by other stylesheets. Literal `@import`, Sass `@use`/`@forward`, CSS `url()`, and literal quoted `image-set()` image choices are checked against **the same shared/sibling and intra-module layer-direction policy as JavaScript/TypeScript**, plus the scanned source root. Vite aliases are honored for these references; stylesheets cannot disguise a private business asset as shared code.

Nonliteral expressions (such as `url(var(--asset))`), multi-target Sass imports, computed `meta.load-css()` calls, and unverified local/package paths produce explicit diagnostics instead of being silently accepted. The scanner recognizes Less/SCSS/Sass `//` comments without treating unquoted URL schemes as comments. Literal Less import options such as `@import (reference, optional) "./tokens.less"` and `@import (inline) "./base.css"` are supported in `.less` files; unsupported options fail closed. A missing `(optional)` target is allowed, but an existing optional target must still respect the same boundaries. Sass/Less interpolation such as `url("#{$name}/asset.svg")` is rejected as unverifiable, not mistaken for a safe fragment. Literal `image-set()` choices are conservatively validated, although the bundler may handle individual string choices differently. Data URLs, fragments, remote URLs and built-in `sass:` modules are not local source dependencies. This is a **conservative static scanner**, not a full CSS/Sass/Less/PostCSS compiler. Custom transformations or unusual preprocessor resolution must be verified against the actual build output separately.

Run the stylesheet scanner's own tests through root `npm run test:architecture`, which includes `tools/css-dependencies.test.cjs`. See [Less import options](https://lesscss.org/features/#import-options) for supported syntax. As always, use a real Vite build to validate bundler behavior.

## Avoid circular "generic" services

A generic `shared/analytics` helper must not import an Order type to format an event. Instead, keep primitive analytics transport in shared and an Order-specific adapter inside orders/infrastructure; compose them at the application boundary. The same pattern applies to logging, notification payloads, permissions and API transport. See [ADR 0003](decisions/0003-generic-services.md).

## Scope of enforcement

Run `node tools/check-boundaries.cjs examples/react-app/src` from the repository root, or `npm run verify` after installation. The checker uses the TypeScript AST and module resolver, not a regex-only import scanner. It checks locally resolved source and asset edges, but cannot reason about nonliteral dynamic imports, runtime globals or semantic ownership of every external package. A production application may also adopt [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) or equivalent tooling; continue to run typechecks, runtime tests, accessibility tests and security audits.

### Resolver integrity and alias trust

The architecture checker checks **physical destinations**, not just recognizable import prefixes. Bare `baseUrl` imports resolving to local files outside the validated `src/` tree are rejected. For TypeScript `paths` imports of styles and assets, the most-specific path pattern wins; mirror any bundler-specific resolution (including Vite aliases) with a real build and conformance tests.

To use the supported Vite expression `fileURLToPath(new URL('./src/...', import.meta.url))`, **import `fileURLToPath` directly from `node:url`**, and do not shadow either that function or the global `URL` constructor. The checker does not evaluate arbitrary Vite JavaScript or plugin aliases, so such configurations need independent bundler-level validation.


### Pure dependency target policy and Vite import modes

Pure `domain/`, `model/`, and `application/` code can depend only on the allowed layers within the **same module** and domain-neutral `shared/lib/` or `shared/domain/` helpers. Pure shared helpers can depend only on pure shared helpers. Any unfamiliar top-level source folder (for example `integrations/` or `utils/`) is **not implicitly pure**; decide its ownership and place it in the correct known layer instead of inventing exceptions. Test files may use development-only dependencies without turning production code into a technical dependency.

Ordinary, owned JSON data may be consumed by pure modules. A Vite suffix such as `?raw`, `?url`, `?worker` or a plugin-specific query changes the import mode, so a `.json` or `.ts` filename alone does not make the resulting value pure. Pure modules reject these query-modified local assets, as well as static `new URL(..., import.meta.url)` asset handles. Presentation code may still use supported Vite asset modes subject to source ownership checks.

Architecture test fixtures must store their exact declared contents. Valid Vite URL helper fixtures explicitly import `fileURLToPath` from `node:url`; fixture setup must never supply missing imports on their behalf.

### Nonstandard and CommonJS Vite configurations

The checker inspects all six default Vite config extensions: `.ts`, `.mts`, `.js`, `.mjs`, `.cts` and `.cjs`. It handles statically readable `module.exports = { ... }` for CommonJS; additional top-level CommonJS side effects and dynamic exports fail validation. When any npm script selects a nonstandard path with `vite --config`, declare that exact project-relative filename in `architecture.config.json`:

```json
{
  "viteConfig": "custom.vite.config.ts",
  "viteAliases": {
    "@": "src/shared"
  }
}
```

A declared file must remain within the project (including after following symlinks). Inconsistent Vite configuration selections across npm scripts are rejected. Configurations launched with an external CLI argument that is not represented in scripts must likewise be declared explicitly; untracked external launchers are outside the checker’s automatic discovery scope.

For `fileURLToPath(new URL(path, import.meta.url))` aliases, the checker uses actual `URL` and `fileURLToPath` behavior, including percent-decoding and normalization of encoded dot segments. It rejects invalid encoded separators and mismatches against the policy-mirrored physical path. As before, arbitrary Vite plugins and runtime configuration transformations require a separate real build-level check.

### Static configuration and documentation-parser limitations

The architecture checker only accepts one **static** CommonJS `module.exports = { ... }` object plus optional inert string directives (such as `"use strict"`). Other top-level statements are rejected, including variable declarations with initializers that could mutate the exported alias map. This is intentional fail-closed behavior, not a restriction imposed by Vite itself. Vite configuration built dynamically must instead be independently reviewed and the effective bundler behavior verified.

The checker isolates each supported shell command within npm scripts when identifying Vite's own `--config` option; flags belonging to ESLint or another command are not Vite configuration selections. Scripts with multiple conflicting Vite invocations or ambiguous configuration flags fail closed. This limited shell analysis is not a complete interpreter for arbitrary shell functions, runtime wrappers, or externally supplied CLI overrides; inspect your actual build scripts and verify Vite's effective configuration before relying on an architecture-check result.

The Markdown link validator masks inline code before interpreting HTML-comment markers, ignores links in fenced blocks inside ordinary list/blockquote containers, and reports unmatched fenced blocks consistently. It remains a conservative lightweight validator, not a general CommonMark rendering engine; advanced or plugin-specific Markdown syntax requires review.

### Vite executable, root and option verification

The architecture checker scopes Vite options to the actual executable in each supported npm-script command. It recognizes default `vite`, installed local Vite binaries, and documented `-c`/`--config` configuration flags (with separate values or `=` syntax). It rejects duplicate configuration options and conflicting choices. A `vite` word printed by `echo` or used as another command's argument does not select the configuration to inspect.

The effective working directory matters: commands such as `cd nested && vite build`, or positional project roots like `vite build nested`, are rejected until the project-root semantics can be verified. Unrecognized execution wrappers, arbitrary shell transformations and unsupported CLI arguments are **not assumed safe**. Prefer clear scripts and mirror custom config filenames in `architecture.config.json`; independently verify final Vite alias resolution in the real build.

For Markdown link validation, an escaped `\<!--` must not start an HTML comment; once a real `<!--` has opened a comment, its `-->` terminator is recognized even inside backticks. Indented code and fenced code cannot mutate the HTML-comment state. The parser remains a conservative subset and does not implement the complete CommonMark grammar.

### Nested launchers, optional Vite host values, and Markdown link metadata

An npm script running Vite through an opaque shell interpreter (`sh`, `bash`, `cmd`, PowerShell, or equivalents) is rejected rather than silently inspecting the default config. This includes embedded command strings, interpreter flags, script files, and common environment wrappers. The supported static grammar also rejects programmatic Vite calls in inline Node evaluations; arbitrary external build scripts must receive separate real-bundler verification. Keep Vite launches directly visible in the npm script. Unlike configuration flags, Vite's `--host` accepts an optional hostname; the checker permits no value or a specified host while failing closed on ambiguous subcommand placement.

The Markdown link scanner protects the inline destination and quoted title from false HTML-comment recognition, while preserving the original link for subsequent existence checks. It retains UTF-16 character positions so Unicode text before a link cannot shift masking offsets. This is still a constrained Markdown linter, not a complete CommonMark implementation; complex link/container syntax should be verified independently before being treated as enforced.

### Trusted Vite helpers and explicit build entrypoints

The Vite config checker now accepts the `defineConfig({ ... })` wrapper only when `defineConfig` is an unaliased runtime import from `vite` or `vitest/config`. A locally defined or unrelated helper, and additional executable ESM top-level declarations, fail closed because they could mutate an otherwise static alias map. Recognized `build`, `dev`, `start`, `serve`, `preview`, `bundle` and `watch` entrypoints must expose a supported Vite invocation directly; opaque `node`/`tsx`/other external build runners and arbitrary npm-script delegation fail closed. The documented reference `npm run arch && tsc --noEmit && vite build` remains supported. These are conservative static restrictions, not limitations of Vite; dynamic configs and plugins require independent real-build validation.

Markdown reference-definition destinations and quoted titles now receive the same HTML-comment protection as inline links. An apparent `<!--` inside a valid reference title cannot hide subsequent broken links, and the reference destination is still checked. The lightweight scanner is not a complete CommonMark parser.

### Delegated scripts, lifecycle hooks and Markdown labels

Delegation to `npm run arch`, `check:arch` or `test:architecture` is considered inert **only** when the target actually exists and is exclusively a local `node .../tools/check-boundaries.cjs [source]` command. The complete command must be free of shell chaining, pipelines, redirection, command substitution and additional executable arguments; `pre<name>`/`post<name>` hooks on delegated commands are not trusted. All scripts named `prebuild`, `postbuild`, `predev`, `postdev` (and corresponding named build/dev variants) are analyzed as execution entrypoints because npm runs those hooks automatically. Supported explicit Vite commands still share the same effective config verification. These deliberately conservative constraints avoid certifying unknown executable behavior.

The Markdown scanner now masks valid image alternative text for comment detection while retaining the image destination for normal link checking. An immediately following, syntactically valid multiline reference title is likewise not an HTML comment, even if it contains `<!--`. For more complex Markdown constructs, use a conformant CommonMark parser; the lightweight repository checker does not claim full grammar support.

### CommonJS loaders and npm verification hooks

The import walker treats literal `module.require('./path.cjs')`, `module['require']('./path.cjs')` and ordinary `require('./path.cjs')` as runtime dependencies, enforcing the same ownership and cycle rules. Computed `module[method](...)`, nonliteral paths and detached or indirectly invoked require functions fail closed; supported static analysis cannot infer their targets. Creating arbitrary Node loaders through `createRequire` is unsupported and must be reviewed using a separate execution-aware mechanism. Loader restrictions apply to `src/` files; the tool does not claim to audit arbitrary runtime reflection or plugins.

When checking effective Vite config, npm hooks named `pre<name>` or `post<name>` are treated as possible build invocations **when the matching `<name>` script exists**, not only when the parent happens to be called `build` or `dev`. This includes `preverify`, `postverify`, `pretest` and namespaced scripts. Explicitly supported inert commands and direct Vite launches remain allowed; opaque external runners or nested shells fail closed. Validating npm script text does not replace real build execution or checking dependencies' own installation hooks.

For Markdown, the lightweight validator masks balanced reference-style link and image labels for HTML-comment detection while preserving the original line for destination checks. `<!--` within full, shortcut and collapsed reference labels is not treated as an opening HTML comment. The implementation remains a restricted subset of CommonMark: use a conforming parser if comprehensive Markdown grammar support becomes a requirement.

### Node loader bindings, npm command graph and Markdown syntax boundaries

A literal `require("./dep")`, `module.require("./dep")`, or `module["require"]("./dep")` is an auditable dependency. A bare Node `require` or `module` value cannot be copied into another variable, passed as an argument, destructured or rebound while preserving auditability. Such uses fail closed with `unsupported-indirect-commonjs-loader`; this deliberately narrow static contract avoids false assurances about loader aliases. Direct `module.exports` assignments remain supported, as do direct literal imports. This rule does not claim to prove arbitrary JavaScript runtime behavior.

Vite npm script verification now starts from supported build, dev, preview, verify, test, lint and check entrypoints; traverses `npm run`, `npm test` and `npm start` delegation; and expands each reachable npm `pre<name>`/`post<name>` lifecycle hook. Unknown target scripts, cycles and executable Node/TSX/etc. builders are rejected. The reference app's normal `verify -> lint/test/build -> arch/tsc/vite` graph is accepted, along with explicit safe tool invocations. Tool allowlists constrain executable forms; custom runners need explicit, independently audited support. Do not mistake this static subset for full arbitrary shell or Vite plugin validation.

For Markdown, balanced inline and reference-style brackets (including nested labels and backslash-escaped closing brackets) are distinguished from actual HTML comment openers. Shortcuts and collapsed references are recognized only when a matching local definition is present; unmatched bracket text does not mask genuine comments. Original destinations are still validated. This linter is not a complete CommonMark parser: a maintained parser/tokenizer and rendered-token parity tests are the preferred future replacement.

### npm argument-forwarding and workspace boundaries

Static Vite validation uses an intentionally narrow npm delegation grammar. A script may invoke `npm run <script>`, `npm run --silent <script>`, `npm test` or `npm start` without changing execution context. Any `--` forwarded arguments, `-c`/`--config` forwarded to Vite, `--mode`, npm workspace/prefix selectors, or pnpm/yarn workspace filters are unsupported and rejected instead of certifying the wrong Vite config. Nested delegations and pre/post lifecycle hooks retain this restriction; actual bundler conformance is still a separate mandatory check.

Node `process.mainModule` (including `process["mainModule"]`) is a deprecated yet executable CommonJS module-loading escape hatch. It is explicitly unsupported by the static import graph, which otherwise cannot resolve imports relative to a different entrypoint. As with other unknown execution loaders, use explicit supported imports or an independent execution-aware audit.

The Markdown scanner reuses its escape-aware nested bracket matcher in destination extraction, not only in HTML-comment masking. Both `![outer [inner] label](asset.png)` and `[outer [inner] label](page.md)` receive local-target checks. This is not a complete CommonMark implementation; prefer an established tokenizer/parser for comprehensive grammar support.

### Verified test runners and TypeScript declaration names

An approved npm script is not necessarily inert just because it invokes a test runner. Only `vitest run` without additional CLI arguments and `node --test` followed by explicit test-spec file targets are accepted by the static npm script checker. Node preload flags (`--import`, `--require`, loaders), executable reporters, Vitest `--config` and other runner switches fail closed because they can alter which modules or Vite configuration execute. This is CLI-grammar validation, **not** proof that arbitrary test code or `NODE_OPTIONS` cannot start a separate build. Real integration/bundler checks are still required.

The CommonJS guard checks runtime *uses* of `module` and `require`, not declaration-site keys in TypeScript interfaces, class properties/methods, parameter declarations or enum members. Direct supported literal CommonJS imports still create dependency edges, while aliasing the loader object/function remains outside the supported grammar.

Markdown code spans can span multiple lines inside a paragraph; the linter tracks matching delimiter runs rather than interpreting literal `<!--` within them as HTML. Reference-definition indexing ignores definitions inside code fences, indented code blocks and raw HTML comments. This is a bounded static subset; CommonMark-wide validation should use one established block+inline token model.

### Local CommonJS names and Markdown block precedence

A CommonJS loader dependency exists when the built-in `require` or `module.require` function actually loads a module—not simply when ordinary application data uses the same identifier names. The checker exempts TypeScript property/destructuring keys and references with an explicitly typed primitive local binding or parameter. Nearest lexical bindings take precedence to avoid an unsafe nested loader parameter borrowing an outer safe binding. Dynamic aliases, untyped shadowing and unsupported loaders remain fail-closed. This is intentionally more conservative than full TypeScript symbol/type resolution; it must not be mistaken for a proof of arbitrary JavaScript runtime behavior.

The Markdown validator's reference prepass now excludes definitions in block-level HTML content, including raw-text elements (end-tag termination) and ordinary block HTML (blank-line termination). Its multiline code-span lookahead respects the fact that an HTML comment starting as a block interrupts an inline paragraph and cannot supply a backtick closer. These rules are checked against CommonMark output, including a formerly incorrect fixture. A maintained CommonMark block+inline parser is still preferable to indefinite expansion of this limited checker.

### Escaped CSS identifiers and Vite plugin configuration boundaries

The stylesheet scanner deliberately rejects backslash-escaped **at-rule and function identifier tokens**, as they may encode real CSS `@import` or `url()` dependencies that a regular-expression scan would otherwise omit. It is a static subset, not a general CSS parser. Quoted content remains masked from dependency identification.

The static Vite alias comparison is not an effective-config proof when executable plugins can run `config()` hooks. Where a statically declared alias map coexists with nonempty/opaque plugins, it emits `unverifiable-vite-plugin-alias`. Empty literal plugin arrays remain permissible. A real Vite resolved-configuration/bundler gate is necessary for custom plugin alias behavior, including plugins that add previously undeclared aliases. Do not interpret successful AST parsing as full plugin verification.

### Static Vite plugin and build entrypoints: precise trust boundary

A plugin can **add** `resolve.alias` even if the exported static configuration has no aliases. The checker therefore rejects nonempty or computed `plugins` values without relying on `aliases.size`. The sole narrow exception for the reference example is an unconfigured `react()` default import from `@vitejs/plugin-react`, with exactly version `4.7.0` declared in `package.json` and no static/policy aliases. This is an explicit bounded trust assumption; independent Vite resolved-config and build checks remain required.

Static source-root coverage does not prove that arbitrary `root`, `build.rollupOptions.input`, `build.lib.entry`, `build.ssr`, multi-environment builders or HTML entrypoints stay within `src`. Such custom Vite build-root and input settings are now unsupported and fail closed, except the literal default `root: '.'` and empty `build: {}`. When present, the default `index.html` is checked for module-script and stylesheet entry files outside the checked tree. A full Vite graph check is still required for plugin transforms and advanced HTML/build formats.

Markdown reference-definition discovery now masks multiline inline-code spans before indexing definitions. Phantom definitions inside code no longer suppress actual HTML-comment delimiters, while valid definitions outside a completed code span remain active. This is a restricted CommonMark subset, not a replacement for a conformant token stream.

### Post-source Vite injection and executable HTML (review #5636476418)

Static AST import checking cannot detect dependencies inserted **after** collection. To avoid false architectural passes, nonempty/computed `esbuild` and `css` Vite option values are unsupported, including `jsxInject` and preprocessor `additionalData`. Inert empty option objects and `esbuild: false` remain accepted. A dedicated resolved/transformed Vite module graph verification is required to support broader configuration safely.

The bounded `index.html` checker treats scripts and styles as dependency-bearing code: `on*` event handlers, `style=` attributes, inline `<style>` elements, `srcdoc`, executable/obfuscated URI attribute values, `meta` refresh and import maps fail closed because the checker does not extract their runtime imports/assets. This applies even when static external module `src` is safe. Prefer `<script type="module" src="/src/main.tsx">` and a linked stylesheet in the checked source tree. URLs containing HTML character references are intentionally unsupported by the bounded checker; resolve those with a conforming tokenizer and real bundler tests rather than trusting partial entity decoding. Inline JSON data script types remain recognized as non-executable controls.

The validator is a restricted static grammar: it does **not** claim full HTML5 parsing, plugin behavior, source transformation or production bundler graph equivalence. Keep the actual integrated build, security and browser/accessibility checks mandatory.

### HTML5 source coverage and default Vite public files (review #5636660964)

The HTML checker now consumes a single **parse5** HTML5 DOM with parser diagnostics. Do not strip comments or extract script tags using independent regular expressions. HTML RCDATA elements such as `title` and `textarea` handle `<!--` as text; live script and style elements that follow their end tags must still be evaluated. Quoted `>` is valid within HTML attributes and does not end a start tag.

Local HTML dependencies include module-script entrypoints, modulepreload, CSS links, icons, images and responsive `srcset` candidates, media and font preload assets, and relevant SVG media URLs. The checker resolves paths physically within the checked `src` tree or the audited `public` tree, then applies the same module ownership restrictions used by source/CSS imports. The root HTML entry is app-level composition: private sibling-module assets are not available through deep `src` paths. Ambiguous URL forms, active inline code/styles, embedded documents, and unknown HTML resource syntax fail closed.

Default Vite `public/` files are copied without transforms. Therefore the checker now recursively rejects all executable/uncertain public formats and symlinks rather than silently shipping additional HTML/JS entrypoints. Allowed standalone public files are raster images, fonts and a small set of inert media types; `publicDir: false` disables only the special public middleware (ordinary root HTML/static serving still applies), and custom/dynamic `publicDir` paths are unsupported until covered by a real bundler-aware verification. A legitimate use for public HTML/SVG or arbitrary Vite HTML plugins requires extending the explicit ownership policy plus a real build/DOM integration check, not ignoring the static validator's errors.

### Worker graph, secondary HTML entrypoints and Vite HTML metadata

Vite worker bundles have their own plugin/build settings. A static source graph that only inspects top-level `plugins` and source `new Worker(...)` dependencies must not claim safety when `worker.plugins` or `worker.rollupOptions` can transform the worker graph. The bounded static checker therefore supports only omitted `worker` or literal `worker: {}`. All nonempty/dynamic worker settings fail closed pending independently verified worker-bundle dependencies.

Vite serves additional HTML documents inside its project root during development, regardless of the production default `index.html` entrypoint. The current single-page policy rejects sibling and nested `.html`/`.htm` files rather than silently approving code served from otherwise unchecked pages. The scan excludes repository metadata, root third-party `node_modules/`, and `public/` only when the enabled public-asset scanner audits it. Generated-looking root HTML remains in scope. Projects intentionally using multi-page Vite must add a formal HTML ownership/entrypoint policy and both dev/build integration coverage before lifting the restriction.

Vite's supported HTML resource attributes include `<link imagesrcset>` as well as `<meta content>` for explicit recognized `name` and `property` variants. The checked parser expands responsive candidates and recognized metadata image/media URLs, then applies the standard physical-file source scope and module privacy rules. It does not interpret ordinary meta descriptions or generic content attributes as imports. Unsupported responsive-candidate grammar fails closed. These source checks remain separate from required final bundler validation.

### Root-relative HTML exclusions and dependency-bearing external CSS (review #5636815429)

The secondary-HTML discovery step runs recursively over the Vite project root, excluding only **root-level** repository metadata, third-party `node_modules`, and `public/` when separately audited. It must not exclude nested `docs/public`, `pages/dist`, `site/build` or other HTML-bearing paths merely because their directory names resemble generated output. Symlinked directories and HTML documents fail closed; unresolved/dangling symlinks produce a structured diagnostic rather than a filesystem exception. A resolved symlink to an ordinary non-HTML file can remain in scope without creating a false HTML dependency.

Unlike decorative remote media, active CSS loaded by `<link rel="stylesheet">` or a `<link rel="preload" as="style">` can introduce transitive `@import` dependencies. The HTML scanner tags local stylesheet references separately and rejects unverified HTTP(S), protocol-relative and `data:` stylesheet targets. These cannot receive a clean architecture verdict until a deliberate external-resource policy and transitive CSS audit is implemented. Local stylesheets remain subject to the usual physical-path and module-ownership checks.

### Disabled publicDir HTML, transitive CSS and file-resolution failures

`publicDir: false` disables Vite's special public-assets middleware, **not** its project-root HTML development serving. Consequently, the secondary HTML scanner must not exclude the root `public/` subtree when `publicDir` is disabled. Nested HTML files, including `public/hidden.html`, are rejected by the static single-entrypoint policy. The enabled/default `publicDir` uses the separate strict public-asset scanner.

A local stylesheet's `@import`, `@use` or `@forward` directive is a dependency-bearing edge. An HTTP(S), protocol-relative or `data:` target cannot be certified by the local source graph, so it fails closed until separately audited. Decorative external images in `url()` or `image-set()` are not treated as imported stylesheets. `sass:` built-in modules remain supported with `@use`/`@forward`; other imports of `sass:` are unsupported.

Path resolution of TypeScript/JavaScript and stylesheet files is fail-closed. Dangling/inaccessible source or style symlinks produce explicit `unresolved-source-symlink` / `unresolved-stylesheet-symlink` diagnostics rather than crashing the checker. Already verified same-owner symlinks and outside-source/ownership protections remain in effect.

### Exhaustive owned source paths and Vite root-served files (review #5636952721)

The `src/` tree contains the checker’s first-party source and stylesheet graph. Do not skip `dist/`, `build/`, `coverage/` or `node_modules/` by basename anywhere below `src/`: these may be ordinary reachable paths, and a skipped nested file can introduce transitive private-module imports. All supported JS/TS and CSS/Sass/Less files under `src/` are included in the owning graph regardless of the directory name. Git metadata is not application source.

Vite’s dev HTML middleware is independent of typical generated output naming. Therefore `dist/*.html`, `build/*.html`, `coverage/*.html`, `.next/*.html` and `.vite/*.html` under the project root cannot receive implicit exemptions, even when produced by a previous build. Reject or explicitly verify them as additional development entrypoints. Root third-party `node_modules/` and `.git/` are excluded from first-party HTML discovery, not certified unreachable. Actual dev-response tests are required to expand or revise the scope.

The public-asset scanner runs even with `publicDir:false` for active/unknown file formats because Vite’s root-static middleware is independent of its disabled public-assets middleware. The secondary HTML scanner separately checks root `public/**/*.html` when the special public-assets middleware is disabled. Bounded inert raster/font/media files remain allowed; JS, CSS, SVG, unknown file types and symlinks are not silently trusted.

### Installed package provenance and repeatable Vite output

For a JS/TS import to count as a third-party package outside the owned `src/` graph, it must be an actual **bare package specifier** resolved by TypeScript as an external library **and** reside beneath a `node_modules` directory on the importer's ancestor directory chain. A slash-delimited substring `/node_modules/` alone is insufficient: TypeScript can mark relative/alias imports to unrelated `vendor/node_modules` paths as external. Such imports remain outside-source errors. A first-party file under a nested `src/**/node_modules/` directory is still owned and fully checked. This intentionally bounded rule may require explicit coverage for nonstandard package managers/virtual stores.

To prevent generated production HTML from becoming an unverified dev-served page, the reference application's supported `npm run build` uses Vite's `--outDir ../../.vite-build/react-app --emptyOutDir`; `npm run preview` uses the matching output. The generated directory lies outside `examples/react-app`, the Vite project root. The checker **continues rejecting** unexpected root-level `dist/**/*.html` and `build/**/*.html` under that project. Changing the build script/output or introducing nonstandard served roots requires separate review and a real Vite dev/build test.

### Linked workspace package resolution — CR-P1-003

Installed bare imports may resolve through symlinks to workspace packages outside the checked `src/` tree. With TypeScript's default `preserveSymlinks: false`, `resolvedModule.resolvedFileName` is the physical workspace file, while `resolvedModule.originalPath` retains the installed logical path under an ancestor `node_modules/`. With `preserveSymlinks: true`, the installed path is the resolved filename itself. The checker now validates that the logical path is under an importer's ancestor `node_modules/` **and** that it resolves to the same physical file before treating the bare import as a third-party package. Relative, aliased and unrelated `vendor/node_modules` paths are still rejected or checked as owned source. Scoped-package and real-symlink fixtures cover both modes; these do not automatically certify any workspace package's internal architecture or runtime safety.

### Bare stylesheet imports and resolved first-party baseUrl ownership

Vite can load side-effect CSS/Sass/Less from installed packages even when TypeScript `resolveModuleName()` returns no resolved module for the stylesheet. To avoid silently certifying a graph that omits active stylesheet imports, the checker now emits `unverified-package-stylesheet` for bare CSS/SCSS/Sass/Less imports, including `.module.css` and query-qualified forms. Such package stylesheet imports require separate explicit verification before permitting them. Internal relative CSS and declared Vite/TypeScript alias mappings still resolve through the local stylesheet owner graph; allowed third-party JS/TS package imports are unaffected. In pure production layers, bare package stylesheet imports also emit `pure-layer-static-asset`.

For JS/TS pure-layer imports, a non-relative specifier is **not proof of a third-party package**. A source import using TypeScript `baseUrl` can resolve to a file already enumerated under `src/`. Those imports follow the normal first-party module/layer ownership policy instead of triggering `pure-layer-external-package`. Only unresolved or unowned bare imports are candidates for package-specific pure-layer restrictions; actual installed packages still require `allowPureExternal` review where applicable. Transitive or forbidden local paths are not exempted.

### Package-export stylesheet resolution and unknown runtime imports

A bare import need not end in `.css` to load CSS. Vite resolves package `exports`, including extensionless root/subpath entries and conditional targets that may differ from TypeScript's `types` target. This static checker now reads the **matching** package export from the nearest ancestor `node_modules/<package>/package.json` and fails closed if any relevant conditional, array, wildcard, scoped or legacy entry target is a `.css`, `.scss`, `.sass`, `.less`, `.styl` or `.stylus` file. Missing or unreadable/malformed package manifest data cannot certify a stylesheet: active unresolved bare runtime imports are rejected as `unverified-package-import` outside test-only source. Explicit bare stylesheets emit `unverified-package-stylesheet`.

This check does **not** parse external stylesheet contents or assert every Vite export/condition is statically reproducible. Supporting installed package styles requires an explicit audited build/ownership policy. Unrelated JavaScript exports of the same package remain acceptable when genuinely resolved, while first-party imports and explicit aliases retain their ordinary layer checks. Type-only missing imports are handled by project typechecking rather than treated as executable stylesheet edges.


### Executable configuration, PostCSS and self-package imports

The static checker cannot certify executable Vite config imports from arbitrary modules, unsupported config properties (which evaluate before the exported object is consumed), or package scripts using shell redirection and expansion. Such forms fail closed until an effective build-graph verification is available. For the React reference, a deliberately narrow set of static Vite/React/Vitest imports and declarative test options is permitted.

Vite can auto-discover PostCSS plugins independently of its `css` config property, including in ancestor directories and `package.json`. The checker rejects those configurations because plugins can introduce dependencies after raw CSS scanning. It also inspects nearest-package `#imports` and self-name `exports` mappings for CSS/Sass/Less/Stylus alternatives that TypeScript declaration resolution could otherwise conceal. An actual resolved Vite build and complete repository checks remain necessary.

### Runtime package mapping versus erased type dependencies

TypeScript `paths` and `baseUrl` settings do not rewrite emitted imports. Before trusting a first-party TypeScript alias, the checker inspects executable nearest-package `#imports` and self-name `exports` mappings for CSS runtime alternatives, including chained redirects into installed packages. An optional Vite query suffix on a `#name` does not change the package key. Fully erased `import type` statements are still checked for source-layer ownership but do **not** cause runtime stylesheet violations; preserved `import { type X }` syntax under `verbatimModuleSyntax` can still execute an empty import and must be checked.

CSS dependency recognition checks complete `url()`, `image-set()`, `-webkit-image-set()` and Sass `load-css()` function identifiers, rather than mistaking custom longer names like `image-url()` and `app-load-css()` for those functions. Unknown preprocessing transformations still require separate build-graph verification.

### Runtime JavaScript package graph verification

A TypeScript `paths` alias or declaration `types` condition must not certify the executable target of `#imports` or a package self-name `exports` path. The checker separately follows every potentially executable local mapping (including conditional and wildcard targets), resolves its source-module ownership, enforces the same module/layer policy, and adds it to runtime-cycle checks. If targets are external, cyclic, missing, outside the owned tree, or not statically verified, the checker fails closed with `unverified-package-runtime-mapping`. Type-only erased imports remain source-level checked but do not add a runtime edge. These checks are intentionally conservative, not a replacement for bundler-graph verification.

The checker does **not** yet implement Stylus dependency semantics. Any owned `.styl` or `.stylus` file is reported as `unverified-vite-stylus-graph` rather than mistakenly certifying its imports, including when HTML points directly at a Stylus entrypoint. Supporting Stylus requires audited preprocessing/graph coverage and end-to-end Vite conformance tests.

### Query-qualified package imports: asset versus executable edges

The runtime package-map verifier distinguishes Vite `?raw` and `?url` data loaders from executable module and `?worker` entrypoint imports. `?inline` and `?no-inline` are only asset-inlining modifiers: on an ordinary JavaScript/TypeScript source file, these modifiers **do not** turn source into data, so executable dependency edges and valid pure-layer source imports are preserved. Real CSS/images remain assets and cannot be imported into pure layers. Package-mapped `?raw`/`?url` data imports still undergo first-party ownership and static-asset purity checks, but do not add executable cycle edges. Other unrecognized or combined query modes are treated conservatively for purity; runtime edges are not suppressed without a known data loader. The existing TypeScript-based path checks remain in place for aliases; a true data transformation cannot be justified merely because the source file has a JavaScript or TypeScript extension.

Resolution-cycle detection now uses the *active recursion stack* rather than a global seen-history. Multiple conditional/array branches may safely point to the same valid self-package export without a false cycle. A `#imports` value that redirects directly to another `#` key is not a supported Node target and is marked unverifiable, even if following it finds an owned source; truly cyclic redirects remain rejected. These rules are covered by explicit positive and negative fixture tests; dependency-backed Vite integration verification is still mandatory.

### Third-party package shadowing of TypeScript-only aliases

A TypeScript `paths` or `baseUrl` resolution does not itself rewrite a Vite runtime import. When a runtime bare import resolves to a known first-party TypeScript source but an installable package with the same name also exists in the importer's ancestor `node_modules`, the checker fails closed: stylesheet exports produce `unverified-package-stylesheet` and other package targets produce `unverified-package-runtime-mapping`. This includes scoped/subpath and legacy manifestless package directories. A previously verified Vite `resolve.alias` takes precedence. A matching TypeScript `paths` pattern or broad `baseUrl` candidate is *not* evidence of owned source: if both TypeScript's configured resolution and unaliased package resolution agree on the same genuine installed external dependency, it remains a third-party package and retains normal external-package, stylesheet, and pure-layer restrictions. Conversely, first-party `baseUrl` imports may have **arbitrary names** (including single-segment `helpers` and nested `features/helpers`): owned resolution is determined by the actual TypeScript-resolved file, not by fixed folder prefixes. Direct CSS/image/JSON baseUrl assets that TypeScript cannot type-resolve are eligible as owned only when a concrete file exists within the checked source tree. Any installed same-name package without a verified Vite alias is a potential runtime shadow, including for assets. `?raw`/`?url` imports of such owned source must still obey pure-layer static-asset restrictions. These inferred aliases do **not** override Node `#imports` or same-package `exports`: those have independent runtime-target verification, so their valid raw/URL data mappings must not be mistaken for local baseUrl assets. Deliberate aliases into vendor directories remain forbidden; owned source aliases that conflict with installed packages remain fail-closed. Erased `import type` remains a source ownership check, not an executable package import. Exact Vite bundler resolution must still be independently tested before release.

### Exact Vite query flags and unknown source queries

Vite 7.3.7 recognizes `?raw` and `?url` only as complete query tokens (`?raw`, `?raw&inline`, etc.). `?raw=true`, `?url=1` and `?worker=1` are **not** those flags. The checker uses Vite-equivalent token boundaries for `raw`, `url`, `worker`, and `sharedworker`. Unrecognized query syntax fails closed as `unverified-vite-import-query`; it cannot suppress executable JS/TS edges or impersonate a static asset to bypass the module's public API. Actual inline-modified CSS/images remain static assets and explicit data queries still do not create source-execution edges. Only known query syntax is statically supported; Vite plugin and full build behavior must be verified separately.

### Extensionless transformed imports and runtime alias proof

Vite's default resolver can complete an extensionless relative source import such as `./config?raw` to an existing `config.ts`; JSON modules are also eligible under Vite's standard extension order. The checker now tries an existing literal file first, then Vite's default extension order (`.mjs`, `.js`, `.mts`, `.ts`, `.jsx`, `.tsx`, `.json`) on the actual candidate paths. Its last-resort source resolution is restricted to enumerated checked source files, with physical-path ownership and symlink containment checks preserved. A transformed source is still an asset for domain/application/pure-shared restrictions; executable extensionless `?worker` entries still contribute runtime graph edges. By contrast, extensionless `?inline` or `?no-inline` imports that resolve to ordinary first-party JavaScript/TypeScript remain executable source edges rather than assets. Missing source files remain errors, not assumed virtual modules.

**TypeScript's `paths` and `baseUrl` do not rewrite emitted JavaScript.** Vite's default bare-specifier resolver does not honor those mappings automatically. A runtime bare import that TypeScript resolves to first-party source without a verified Vite `resolve.alias` or a separately audited Node `#imports`/self-name runtime mapping is therefore reported as `unverified-vite-runtime-alias`. A same-name installed package remains subject to independent runtime-shadow checks. Ordinary installed external dependencies remain external, and fully erased `import type` dependencies do not need a Vite runtime alias. For legitimate first-party imports, use relative paths or an explicit matching and audited Vite alias (or another runtime-resolution mechanism with real graph verification). Do not mistake successful TypeScript resolution or a permissive architecture ownership check for a build-ready Vite dependency graph.


### Vite executable-file precedence and Less executable plugins

For executable relative imports and verified Vite aliases, the source checker must follow the physical runtime file Vite resolves, not TypeScript's preferred type substitute. A real `b.js` takes precedence over a same-name `b.ts`; extensionless imports use Vite's default extension order and missing JS may fall back to TypeScript. Unverifiable directory-package entry mappings fail closed; erased type-only imports retain TypeScript ownership resolution.

Less `@plugin` can load arbitrary preprocessing JavaScript outside the verified CSS dependency graph. Owned `.less` files containing an executable `@plugin` directive now fail with `unsupported-less-plugin` until verified plugin-graph support is implemented.
