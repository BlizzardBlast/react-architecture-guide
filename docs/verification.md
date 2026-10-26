# PR #1 local verification — 2026-10-26

CR-P1-011's recurring installation and verification blocker is resolved for this candidate. The previous environment's registry failures are historical: this run reached the public npm registry, generated authentic lockfiles for all three packages, and completed clean installs with Node 24.22.0 and npm 11.19.1 on Windows.

## Review repair ledger

Baseline: clean branch `docs/m1-executable-architecture` at `7e6e97385628ffdc79971594d515231ae2cab4c4`, compared with `origin/main` at `5154e7d7150c34d5459cc616f309fb9d01b7f1aa`. Pass 1 resolves the ten scoped findings below. Earlier review evidence included an intermittent route-test timeout; both this run's aggregate gate and isolated clean setup passed all React tests without retrying a failure.

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
| Clean dependency installation | All three package installs passed in the earlier candidate; this repair additionally passed isolated root/React `npm ci --engine-strict` followed by the complete example `verify` |
| `npm run verify` | Passed: 109 Markdown tests, 441 architecture tests, 6 orders tests, 21 React tests; no skipped tests |
| Checks included in `verify` | Markdown links/fences, both example boundary checks, orders compilation, React Hooks/JSX accessibility lint, React typecheck and Vite 7.3.7 production build |
| `python scripts/validate_docs.py` | Passed through the shared Markdown validator |
| `npm audit` in each of the three packages | Zero reported vulnerabilities in all three resolved trees |
| A second consecutive `npm --prefix examples/react-app run build` | Passed without changing output location or weakening the secondary-HTML rule |
| Dev and preview HTTP smoke | Entry HTML, linked JS/CSS assets and `/about` fallback returned 200 with expected content types/content |
| Dev browser smoke | Catalog rendered; empty customer name produced a linked error (`aria-invalid`/`aria-describedby`); saving a valid order updated history; changing product cleared success feedback; About navigation worked via Enter |
| Production preview browser smoke | Built app rendered and was exercised separately from the dev server |

These are locally observed results, not GitHub Actions evidence. No workflow was added or merge performed. This is a bounded browser/accessibility smoke test, not a full screen-reader, cross-browser or WCAG audit. Deferred saves, failure/retry and in-flight product switching are covered by the React tests; they were not fault-injected in the browser. Arbitrary plugin/worker graphs still need their own runtime conformance evidence.

The jsdom route test reports its unsupported `window.scrollTo` operation while passing; the real browser navigation check also passed. npm reports an ESLint 9 end-of-support notice and a deprecated transitive encoding package; its audit reports no known vulnerabilities. Audit results describe this run's registry snapshot, not future vulnerability status.
