# Verification evidence

These are historical local results, not a claim that the current checkout or its dependencies have passed the same checks. Run the [local verification commands](../README.md#local-verification) for current evidence.

## Checkout browser follow-up — 2026-10-28

On Windows, the in-app browser was exercised against the Vite development server at source revision `86a61a946920ad6f39c1e0fea6ec105654a65efb`. Selecting Green tea updated the selection text; submitting an empty name displayed the validation error; saving a test order displayed `Order saved. Product: Green tea` and added it to history. Selecting Filter coffee preserved the saved product in the feedback, and editing the new order cleared that feedback. These observations cover visible content and the browser accessibility tree, not spoken announcements.

The focused checkout and route Vitest suites passed (29 tests). They include controlled pending-save, product-switch and failure cases; the in-memory demo saves immediately, so those cases were not fault-injected in the browser. Screen-reader speech, including selection, validation, success and failure announcements, remains **NOT TESTED**; a browser accessibility tree does not prove what a screen reader announces.

## Local verification — 2026-10-27

The recorded Windows runs used Node 22.13.0 and Node 24.22.0. Clean registry-backed installations were performed for all three packages; the Node 24.22.0 installation used npm 11.19.1.

| Observed command/check | Result |
| --- | --- |
| Clean dependency installation | All three package installs and isolated root/React `npm ci --engine-strict` followed by example `verify` passed |
| `npm run verify` | Passed on Node 22.13.0 and Node 24.22.0: 123 Markdown tests, 471 architecture tests, 6 orders tests, 21 React component tests and 2 Vite conformance groups per run (623 total); no skipped tests |
| Checks included in `verify` | Markdown links/fences, both example boundary checks, orders compilation, React Hooks/JSX accessibility lint, React typecheck and Vite 7.3.7 production build |
| `python scripts/validate_docs.py` | Passed through the shared Markdown validator |
| `npm audit` in each of the three packages | Zero reported vulnerabilities in all three resolved trees |
| Consecutive production builds | Both Node-version gates built successfully without changing output location or weakening the secondary-HTML rule |
| Automated Vite alias/HTML conformance | The tests checked actual Vite resolution for 23 source/HTML cases, including relative/root imports, URL references, query matching and rejected bare requests, module scripts, encoded HTML paths, CSS links/preloads, images, public precedence, JS preloads, uppercase CSS, media/disabled and vite-ignore controls. These groups are part of the example's npm test command. Earlier URL, stylesheet and encoded asset probes remain historical evidence |
| Targeted focus browser check | A `royalblue` outline was verified in light/dark modes at 320px, with contrast above 3:1 against both backgrounds and no horizontal overflow |
| Dev and preview HTTP smoke | Entry HTML, linked JS/CSS assets and `/about` fallback returned 200 with expected content types/content |
| Dev browser smoke | Catalog rendered; empty customer name produced a linked error (`aria-invalid`/`aria-describedby`); saving a valid order updated history; changing product cleared success feedback; About navigation worked via Enter |
| Production preview browser smoke | Built app rendered and was exercised separately from the dev server |

These are local results, not GitHub Actions evidence. The browser and HTTP smoke checks describe earlier application revisions and were not repeated with the checker changes covered by the full verification runs. The browser/accessibility smoke tests were bounded: they were not a full screen-reader, cross-browser or WCAG audit. Deferred saves, failure/retry and in-flight product switching were covered by React tests but not fault-injected in the browser. Other operating systems and arbitrary plugin or worker graphs remain unverified.

The jsdom route test reported its unsupported `window.scrollTo` operation while passing; the real browser navigation check also passed. npm reported an ESLint 9 end-of-support notice and a deprecated transitive encoding package. Audit results describe the registry snapshot at the time, not future vulnerability status.
