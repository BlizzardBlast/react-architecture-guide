# PR #1 local verification — 2026-10-27

CR-P1-011's recurring installation and verification blocker was resolved in an earlier candidate. That run reached the public npm registry, generated authentic lockfiles for all three packages, and completed clean installs with Node 24.22.0 and npm 11.19.1 on Windows. The current repair changes no dependencies or lockfiles.

## Review repair ledger

Baseline for the current repair: clean branch `docs/m1-executable-architecture` at `bc45e4a9b3f54c4e5b4aabd38de955a67e8f5034`, compared with `origin/main` at `5154e7d7150c34d5459cc616f309fb9d01b7f1aa`. Three bounded passes resolve the two scoped findings below. New regression tests reproduced the failures before implementation; focused tests, related controls and the complete gate now pass. Pass 2 corrects three older fixtures that assumed exact aliases matched query-qualified requests, retaining executable-cycle coverage through a valid prefix alias and checking rejected bare-query requests against Vite. HTML CSS dispatch also follows Vite's case-sensitive extension rule. Pass 3 applies the unsupported-stylesheet-format guard to direct URL resources as well as Vite imports, covering media/disabled/vite-ignore controls. No merge was performed.

| Finding | Remediation and verification | Status |
| --- | --- | --- |
| CR-P1-052 | Resolve matching aliases before relative/root-absolute asset decoys, matching the full query-qualified request. Retain Vite's direct dot-relative URL behavior; reject alias definitions that rewrite transformation flags. Unit tests cover missing targets, leading-hash aliases, JSON layer rules and worker cycles. Real Vite tests cover both alias-reached private assets and valid direct/query URL controls. | Resolved |
| CR-P1-053 | Carry HTML module-import provenance into ownership resolution. Module scripts and Vite-imported CSS links use actual aliases; images, JS preloads, uppercase CSS extensions, media/disabled links and vite-ignore controls retain URL resolution. Public-file precedence, module public barrels, missing targets and unsupported CSS formats retain explicit checks. Two automated Vite conformance groups check 23 real resolution cases as part of example verification, including encoded HTML paths, public precedence, rejected bare-query requests, CSS preloads and non-stylesheet rel values. | Resolved |

Delivery also preserves documentation-only commit `2d5612874468853d5a06339a834c9dd5348f936c`, which advanced the PR during validation. The repair was rebased without changing its implementation; final checks include the interaction-performance guide and all 20 Markdown files. The proposed external interaction benchmarks were not run.

### Previous repair batch: CR-050 through CR-051

This batch began clean at `389f6dab4c265ef070905837f0ad838d719e601d` and resolved its two scoped findings in two passes. A scoped recheck identified slow backtracking on long invalid backtick runs; pass 2 avoids the repeated suffix scan and tests varied fence widths. Its complete gate passed on both Node versions.

| Finding | Remediation and verification | Status |
| --- | --- | --- |
| CR-P1-050 | Include local `new URL()` names without a `./` prefix, resolve them beside the importer after verified Vite aliases, and retain physical ownership, presence, purity and worker-cycle checks. TS-only mappings cannot redirect the URL. Regression cases include module traversal, alias decoys, missing files, template literals, Worker/SharedWorker cycles, standalone URLs, external schemes, protocol-relative URLs and same-document references. Real Vite 7.3.7 builds confirm the private target is rejected while owned local assets and TS-mapping controls pass. | Resolved |
| CR-P2-051 | Reject backticks inside backtick-fence info strings using the existing shared fence grammar. Reference discovery, link visibility and paragraph lookahead therefore agree on invalid openers. Tests cover ordinary/list/blockquote syntax, escaped backticks, reference definitions and multiline inline constructs; valid backtick/tilde fences retain literal contents. GitHub GFM rendering independently confirmed the original active missing-file link. | Resolved |

### Previous repair batch: CR-046 through CR-049

This batch began clean at `81a1dfc08878abfa2ac1a929dd456bc172a55c46` and resolved its four scoped findings in two bounded passes. The scoped recheck found an additional stylesheet-format variant of CR-P1-046, repaired in pass 2. Its complete gate passed on both Node versions.

| Finding | Remediation and verification | Status |
| --- | --- | --- |
| CR-P1-046 | Stop using TypeScript `paths`/`baseUrl` to certify stylesheet targets. Preserve verified Vite aliases and relative resolution; restrict extensionless/partial lookup to the stylesheet format. Negative tests cover TS-only mappings and CSS imports with Sass/Less/underscore decoys; positive controls retain owned relative files, Vite aliases and Sass partials. Real Vite 7.3.7 builds load private package CSS where the old checker accepted a safe decoy; the repaired checker rejects both mapped and format-decoy variants. | Resolved |
| CR-P2-047 | Reuse paragraph-boundary traversal for inline HTML-comment closer lookup. Unclosed inline openers cannot hide links in later blocks; line-leading block comments can still span blank lines. Blank/heading/thematic/list/quote boundary cases, valid multiline comments, trailing links and unclosed inline text pass regression tests. | Resolved |
| CR-P2-048 | Change the visible focus outline to `royalblue`. Browser checks confirm the computed outline in light and dark modes at a 320px viewport, with no horizontal overflow. Contrast is 4.85:1 against white and 3.87:1 against the dark `#121212` background. | Resolved |
| CR-P2-049 | Await initial router loading and give the route integration test bounded query waits and an explicit test timeout. Preserve the selection, submission and order-history assertions without retries. The isolated test and both full Node-version gates pass. | Resolved |

### Previous repair batch: CR-041 through CR-045

This batch began clean at `f04c2074ce323ab6477a606a2b29851649500249` and resolved its five scoped findings in pass 1. Its complete gate passed on both Node versions. The PR description has also been refreshed for the current repair.

| Finding | Remediation and verification | Status |
| --- | --- | --- |
| CR-P1-041 | Decode quoted `image-set()` and `-webkit-image-set()` references as decorative URLs; reject encoded traversal decoys and malformed encodings, accept owned encoded filenames, and preserve literal CSS import resolution. Real Vite 7.3.7 builds agree with the ownership result. | Resolved |
| CR-P1-042 | Traverse attached JSDoc import expressions and `@import` tags as type-only dependencies. JS/JSX/MJS/CJS ownership, pure-package checks, cross-module cycles and internal type-only cycles are covered; documentation names/examples cannot impersonate executable loaders. | Resolved |
| CR-P2-043 | Resolve ordinary local CSS filenames beside their stylesheet, retaining alias precedence and physical ownership checks. Tests cover missing files, pure layers and symlinked private assets; actual Vite builds accept owned `url(icon.svg)` and `@import "theme.css"`. | Resolved |
| CR-P2-044 | Share reference-definition block eligibility between discovery, comment masking and link validation. Inline-comment, quote/list, self-referential phantom-definition, title and forward-reference controls pass. Two old forward-reference fixtures now include the blank line required by Markdown. GFM rendering independently confirmed the paragraph rule and original discrepancy. | Resolved |
| CR-P2-045 | Replace the obsolete 54,482-character PR description with the final scope, current validation and explicit limits. GitHub returned the exact replacement; the PR is open, not draft, and unmerged. | Resolved |

### Earlier repair batch

The earlier batch began clean at `7e6e97385628ffdc79971594d515231ae2cab4c4` and resolved CR-031 through CR-040 in one pass. Its isolated clean setup and aggregate gate passed. A later review reproduced the intermittent route-test timeout; CR-P2-049 above records its repair.

| Finding | Remediation and focused proof | Status |
| --- | --- | --- |
| CR-P1-031 | Record inline `import()` types, including `typeof` and declarations; reject ownership/cross-module cycles while preserving internal type-only cycle warnings under both emit modes. | Resolved |
| CR-P1-032 | Decode HTML/CSS asset URLs before physical ownership checks; encoded traversal decoys, valid encoded filenames and malformed/ambiguous encodings have regression cases. Real Vite 7.3.7 builds confirm the private target and legal URL behavior. Literal CSS import filenames retain their distinct resolution. | Resolved |
| CR-P2-033 | Reject production-to-test dependencies through ordinary/type imports, HTML entries, package mappings and symlinks; genuine tests retain their dependency exemptions. | Resolved |
| CR-P2-034 | Remove the outside-project fixture write and guard fixture containment before writing. An escaping path throws without touching its target. | Resolved |
| CR-P2-035 | Document the root dependency install before the React example install; follow these steps in an isolated copy and run example verification successfully. | Resolved |
| CR-P2-036 | Align root/example Node ranges and registry-backed lock metadata with required dependency engines: `^22.13.0 || >=24.0.0`. Engine-strict clean installs pass on Node 24.22.0; manifest/lock and required dependency engine comparisons cover the advertised lower bounds. | Resolved |
| CR-P2-037 | Ignore at-rule names inside function/URL payloads; local/remote/nested URL controls and subsequent real directives retain correct dependency scanning. Vite accepts the owned `@import.svg` URL. | Resolved |
| CR-P2-038 | Remove the redundant code-span mask that ignored escaped backticks; odd/even backslash controls preserve active links and actual code spans. | Resolved |
| CR-P2-039 | Stop span-closer lookup at paragraph/container boundaries; headings, thematic/setext breaks and new containers cannot hide links, while valid multiline/lazy continuations remain literal. | Resolved |
| CR-P2-040 | Share normalized containers between reference discovery and link visibility; list definitions, inactive list fences and container exits have positive/negative controls. | Resolved |

## Batch verification

| Observed command/check | Result |
| --- | --- |
| Clean dependency installation | All three package installs and isolated root/React `npm ci --engine-strict` followed by example `verify` passed in the earlier candidate; this repair does not change dependencies or lockfiles |
| `npm run verify` | Passed on Node 22.13.0 and Node 24.22.0: 123 Markdown tests, 471 architecture tests, 6 orders tests, 21 React component tests and 2 Vite conformance groups per run (623 total); no skipped tests |
| Checks included in `verify` | Markdown links/fences, both example boundary checks, orders compilation, React Hooks/JSX accessibility lint, React typecheck and Vite 7.3.7 production build |
| `python scripts/validate_docs.py` | Passed through the shared Markdown validator |
| `npm audit` in each of the three packages | Zero reported vulnerabilities in all three resolved trees |
| Consecutive production builds | Both Node-version gates built successfully without changing output location or weakening the secondary-HTML rule |
| Automated Vite alias/HTML conformance | The current repair checks actual Vite resolution for 23 source/HTML cases, including relative/root imports, URL references, query matching and rejected bare requests, module scripts, encoded HTML paths, CSS links/preloads, images, public precedence, JS preloads, uppercase CSS, media/disabled and vite-ignore controls. These groups are part of the example's npm test command. Earlier URL, stylesheet and encoded asset probes remain historical evidence |
| Targeted focus browser check | The previous repair's `royalblue` outline was verified in light/dark modes at 320px, with contrast above 3:1 against both backgrounds and no horizontal overflow; this tooling repair does not change the app |
| Dev and preview HTTP smoke | Entry HTML, linked JS/CSS assets and `/about` fallback returned 200 with expected content types/content |
| Dev browser smoke | Catalog rendered; empty customer name produced a linked error (`aria-invalid`/`aria-describedby`); saving a valid order updated history; changing product cleared success feedback; About navigation worked via Enter |
| Production preview browser smoke | Built app rendered and was exercised separately from the dev server |

These are locally observed results, not GitHub Actions evidence. No workflow was added or merge performed. This is a bounded browser/accessibility smoke test, not a full screen-reader, cross-browser or WCAG audit. Deferred saves, failure/retry and in-flight product switching are covered by the React tests; they were not fault-injected in the browser. Arbitrary plugin/worker graphs still need their own runtime conformance evidence.

The browser and HTTP smoke rows describe earlier application candidates; those checks were not rerun for this tooling repair. Screen-reader and other-OS execution remain unverified. GitHub reports no CI checks for this branch head.

The jsdom route test reports its unsupported `window.scrollTo` operation while passing; the real browser navigation check also passed. npm reports an ESLint 9 end-of-support notice and a deprecated transitive encoding package; its audit reports no known vulnerabilities. Audit results describe this run's registry snapshot, not future vulnerability status.
