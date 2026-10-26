# PR #1 local verification — 2026-10-26

CR-P1-011's recurring installation and verification blocker is resolved for this candidate. The previous environment's registry failures are historical: this run reached the public npm registry, generated authentic lockfiles for all three packages, and completed clean installs with Node 24.22.0 and npm 11.19.1 on Windows.

## Review repair ledger

Baseline for the current repair: clean branch `docs/m1-executable-architecture` at `f04c2074ce323ab6477a606a2b29851649500249`, compared with `origin/main` at `5154e7d7150c34d5459cc616f309fb9d01b7f1aa`. Pass 1 resolves the five scoped findings below. Direct reproductions failed before the fixes; focused tests, related controls and the complete gate now pass. No merge was performed.

| Finding | Remediation and verification | Status |
| --- | --- | --- |
| CR-P1-041 | Decode quoted `image-set()` and `-webkit-image-set()` references as decorative URLs; reject encoded traversal decoys and malformed encodings, accept owned encoded filenames, and preserve literal CSS import resolution. Real Vite 7.3.7 builds agree with the ownership result. | Resolved |
| CR-P1-042 | Traverse attached JSDoc import expressions and `@import` tags as type-only dependencies. JS/JSX/MJS/CJS ownership, pure-package checks, cross-module cycles and internal type-only cycles are covered; documentation names/examples cannot impersonate executable loaders. | Resolved |
| CR-P2-043 | Resolve ordinary local CSS filenames beside their stylesheet, retaining alias precedence and physical ownership checks. Tests cover missing files, pure layers and symlinked private assets; actual Vite builds accept owned `url(icon.svg)` and `@import "theme.css"`. | Resolved |
| CR-P2-044 | Share reference-definition block eligibility between discovery, comment masking and link validation. Inline-comment, quote/list, self-referential phantom-definition, title and forward-reference controls pass. Two old forward-reference fixtures now include the blank line required by Markdown. GFM rendering independently confirmed the paragraph rule and original discrepancy. | Resolved |
| CR-P2-045 | Replace the obsolete 54,482-character PR description with the final scope, current validation and explicit limits. GitHub returned the exact replacement; the PR is open, not draft, and unmerged. | Resolved |

### Earlier repair batch

The earlier batch began clean at `7e6e97385628ffdc79971594d515231ae2cab4c4` and resolved CR-031 through CR-040 in one pass. Its isolated clean setup and aggregate gate passed. The current gate also passed on both Node versions without retrying a failure; the earlier intermittent route-test timeout did not recur.

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
| `npm run verify` | Passed on Node 22.13.0 and Node 24.22.0: 115 Markdown tests, 448 architecture tests, 6 orders tests, 21 React tests per run (590 total); no skipped tests |
| Checks included in `verify` | Markdown links/fences, both example boundary checks, orders compilation, React Hooks/JSX accessibility lint, React typecheck and Vite 7.3.7 production build |
| `python scripts/validate_docs.py` | Passed through the shared Markdown validator |
| `npm audit` in each of the three packages | Zero reported vulnerabilities in all three resolved trees |
| Consecutive production builds | Both Node-version gates built successfully without changing output location or weakening the secondary-HTML rule |
| Vite asset conformance probes | Encoded quoted image-set references are rejected against the actual private target; ordinary owned CSS URLs/imports pass, and source/new-URL encoded filename controls retain Vite's distinct literal resolution |
| Dev and preview HTTP smoke | Entry HTML, linked JS/CSS assets and `/about` fallback returned 200 with expected content types/content |
| Dev browser smoke | Catalog rendered; empty customer name produced a linked error (`aria-invalid`/`aria-describedby`); saving a valid order updated history; changing product cleared success feedback; About navigation worked via Enter |
| Production preview browser smoke | Built app rendered and was exercised separately from the dev server |

These are locally observed results, not GitHub Actions evidence. No workflow was added or merge performed. This is a bounded browser/accessibility smoke test, not a full screen-reader, cross-browser or WCAG audit. Deferred saves, failure/retry and in-flight product switching are covered by the React tests; they were not fault-injected in the browser. Arbitrary plugin/worker graphs still need their own runtime conformance evidence.

Browser and HTTP smoke rows describe the earlier application candidate. They were not rerun for the current tooling repair; screen-reader and other-OS execution remain unverified. GitHub reports no CI checks for this branch head.

The jsdom route test reports its unsupported `window.scrollTo` operation while passing; the real browser navigation check also passed. npm reports an ESLint 9 end-of-support notice and a deprecated transitive encoding package; its audit reports no known vulnerabilities. Audit results describe this run's registry snapshot, not future vulnerability status.
