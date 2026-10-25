# PR #1 local verification — 2026-10-26

CR-P1-011's recurring installation and verification blocker is resolved for this candidate. The previous environment's registry failures are historical: this run reached the public npm registry, generated authentic lockfiles for all three packages, and completed clean installs with Node 24.22.0 and npm 11.19.1 on Windows.

The initial installed architecture run failed 7 of 425 tests. Repairs normalize cycle paths before cross-module classification, reject shadowed CommonJS loaders even for same-owner targets, and correct malformed/stale fixtures. React Query's unpublished `5.90.0` pin was replaced with published `5.90.21` (peer React `^18 || ^19`). The legacy Python documentation entry point delegates to the existing tested Node validator instead of maintaining a second parser.

| Observed command/check | Result |
| --- | --- |
| `npm ci`, `npm --prefix examples/orders ci`, `npm --prefix examples/react-app ci` | All passed using committed lockfiles |
| `npm run verify` | Passed: 96 Markdown tests, 426 architecture tests, 6 orders tests, 21 React tests; no skipped tests |
| Checks included in `verify` | Markdown links/fences, both example boundary checks, orders compilation, React Hooks/JSX accessibility lint, React typecheck and Vite 7.3.7 production build |
| `python scripts/validate_docs.py` | Passed through the shared Markdown validator |
| `npm audit` in each of the three packages | Zero reported vulnerabilities in all three resolved trees |
| A second consecutive `npm --prefix examples/react-app run build` | Passed without changing output location or weakening the secondary-HTML rule |
| Dev and preview HTTP smoke | Entry HTML, linked JS/CSS assets and `/about` fallback returned 200 with expected content types/content |
| Dev browser smoke | Catalog rendered; empty customer name produced a linked error (`aria-invalid`/`aria-describedby`); saving a valid order updated history; changing product cleared success feedback; About navigation worked via Enter |
| Production preview browser smoke | Built app rendered and was exercised separately from the dev server |

These are locally observed results, not GitHub Actions evidence. No workflow was added or merge performed. This is a bounded browser/accessibility smoke test, not a full screen-reader, cross-browser or WCAG audit. Deferred saves, failure/retry and in-flight product switching are covered by the React tests; they were not fault-injected in the browser. Arbitrary plugin/worker graphs still need their own runtime conformance evidence.

The jsdom route test reports its unsupported `window.scrollTo` operation while passing; the real browser navigation check also passed. npm reports an ESLint 9 end-of-support notice and a deprecated transitive encoding package; its audit reports no known vulnerabilities. Audit results describe this run's registry snapshot, not future vulnerability status.
