# React practices independent of folder structure

## State and data

- Keep transient UI state local. Lift it only to its nearest necessary common owner.
- Compute derived values from existing props/state rather than duplicating them and synchronizing with an Effect.
- Prefer route search parameters for shareable navigation state.
- Coordinate route loaders and TanStack Query/SWR; do not maintain redundant remote-data caches.
- Query keys must identify all parameters affecting the response — including tenant, user, filters, locale or backend source when appropriate. Clear private caches on authentication changes when needed. Cache keys are **not** authorization.

## Components and Effects

- Rendering must be pure: do not mutate props, state, or external objects in render.
- Effects synchronize with external systems, not routine derived values or event-triggered work.
- Keep React-specific hooks in UI-facing code; use ordinary functions for pure business rules.
- Use composition, semantic HTML and narrow props rather than a highly configurable monolithic component.
- Handle loading, empty results, mutation pending and failure states explicitly.

## Modern web features and browser compatibility

For **browser-based React UI**, prefer semantic HTML and native CSS/browser features over custom JavaScript when they satisfy the same behavior and accessibility contract. Before replacing an established dialog, popover, form control or animation primitive, compare focus handling, keyboard and touch behavior, dismissal, state ownership, server rendering and styling where applicable. Do not replace a working accessible library component solely to use a newer API. These browser-specific rules do not apply to native React Native views.

Check the application's declared browser support policy against current [Baseline](https://web.dev/baseline) and feature-specific compatibility data before adopting a new API. A Baseline designation does not mean every browser version used by the application supports it. Preserve essential behavior with feature detection, CSS `@supports` and progressive fallbacks as needed; don't add a polyfill without evidence that one is required.

If supported browsers or minimum versions are undocumented, record the gap and seek an explicit project decision before adopting an API that might break existing users. Until requirements are established, preserve the working implementation and its fallbacks; do not invent a support matrix or assume Baseline is the application's support policy. Changes that preserve existing browser behavior may still proceed with appropriate verification.

For modernization work, identify a concrete accessibility, maintainability, security or user-visible performance benefit before changing working code. The optional [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance/modernization-workflow) `legacy-scan` only detects a limited set of patterns: treat matches as **review candidates**, not proven defects or authorization to edit. Inspect surrounding code, intentional fallbacks, component contracts and project requirements. Do not add an unapproved tool installation, automatic rewrite or mandatory CI scanner.

Verify the changed behavior in supported browsers and relevant input modes/preferences (for example keyboard focus, touch, screen readers, IME text composition and reduced motion). Use runtime evidence for rendering and performance claims. Record any unavailable browser checks and keep a working fallback rather than claiming compatibility from static analysis.

For inline text with icons or badges, distinguish a font-relative length from the actual rendered line box. CSS `lh` (and root-relative `rlh`) represents a computed line-height length, not a measurement of the final line box; mixed fonts, inline boxes and their alignment can change the result. Use these units for proportional sizing or spacing where appropriate, not as a guarantee of exact line-box height or vertical centering. When an icon belongs to flowing text, evaluate baseline-aware inline alignment (such as `vertical-align`) rather than assuming an icon sized to `1lh` will align visually. Flex/grid centering remains appropriate for intentional standalone control layouts. For a material change, inspect the actual rendered text/icon combination in supported browsers with wrapping, fallback fonts, increased text size or zoom, and applicable writing directions; preserve readable text, accessible names, and interactive target size. Do not introduce a global alignment rule or replace working styles without evidence. See [CSS Values and Units Level 4 — font-relative lengths](https://www.w3.org/TR/css-values-4/#font-relative-lengths) and [MDN vertical-align](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/vertical-align).

## Performance and React Compiler

Optimize based on measurement. React Compiler can automatically memoize compatible code when correctly enabled, but behavior and compatibility depend on installed versions and configuration. Don't require blanket `useMemo`, `useCallback`, or `React.memo`; don't remove purposeful optimizations blindly.

Treat costly shared UI interactions (such as large comboboxes and bulk-selection controls) as part of the shared component's performance contract. Define realistic workloads, maintain keyboard/screen-reader usability, and measure the interaction rather than inferring speed from bundle size. See [interaction performance contracts](interaction-performance.md).

### Initial page loading and design

For browser-based routes where initial loading materially affects users, define the primary visible content and first usable action during design. Choose rendering and cache strategy per route: static/prerendered HTML for suitable public content, request-time rendering for genuinely dynamic content, and client rendering where appropriate (for example an authenticated interactive application). Do not migrate frameworks or introduce SSR solely on principle. Never put personalized or authorization-dependent responses in shared caches; use content-addressed long-lived static assets only when URLs change with their content, and preserve deployment freshness and cache isolation for HTML/data.

- For changes to caching of private HTML/data, use `Cache-Control: private` when browser HTTP caching is acceptable, or `Cache-Control: no-store` when storage is not acceptable (for example sensitive account responses). `no-cache` requires revalidation; it does not prohibit storage. Inspect effective response headers and applicable framework/data caches, proxies/CDNs and service-worker caches; HTTP directives alone do not govern all application caches or remove previously stored responses. Ensure any unsafe existing entries are invalidated through the owning cache's mechanism. In a representative environment, verify that warming the same route/data cache as identity A does not disclose A's content to identity B (including another tenant where applicable) or an unauthenticated request; also test logout/account switching and permission changes where relevant, including clearing or isolating client-side private state. Preserve authorized access and intended public asset caching. See [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).
- Identify the actual LCP element for representative viewport sizes and the request/render path that delays it. Avoid lazy-loading that element when it is an image; make its resource discoverable early, and use selective fetch priority/preload only when traces justify it. Keep noncritical assets deferred, reserve media dimensions, and avoid expensive offscreen animation. Preserve content, accessibility, reduced-motion behavior and legitimate loading/error states.
- For material initial-loading risk, define a representative device/network profile and agree on route-specific resource budgets (for example initial transferred bytes or JavaScript) when justified by measured baselines and project requirements. If a trustworthy baseline or budget is absent, record a bounded investigation goal and measure first rather than inventing a pass/fail SLA or blocking unrelated UI work. Google's general good field thresholds are LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1 at the 75th percentile, segmented by mobile and desktop. These are not per-run lab assertions or a guarantee for every route.
- Compare production builds under comparable cold/warm cache conditions, viewport, CPU/network settings and representative synthetic data (or explicitly authorized, appropriately sanitized data); record repetitions, actual visible outcome, minimized resource-waterfall evidence and metric definitions. Use field data when available and permitted; do not equate a lab trace with field compliance. A fast shell or skeleton does not prove the primary task is usable. If evidence is unavailable, record the gap and avoid claiming improvement.
- Prefer aggregate timings and sanitized evidence to raw traces or HAR files. Even a tool's sanitized export can retain sensitive URLs, payloads or other identifiers; inspect and remove credentials, cookies, authorization headers, private records and identifying data before any permitted sharing. Never commit or share unsanitized sensitive artifacts; if adequate sanitization is not possible, omit the artifact and report the limitation. See [Chrome DevTools network export guidance](https://developer.chrome.com/docs/devtools/network/reference#save-as-har).
- Keep measurements opt-in/local until a stable controlled baseline and demonstrated regression risk justify a mandatory gate; never relax existing verification. No new telemetry or external data collection is implied.

Sources: [Fast is a design decision](https://shannadige.com/blog/performance-is-design/) (a site-specific case study), [Optimize LCP](https://web.dev/articles/optimize-lcp), and [Web Vitals](https://web.dev/articles/vitals).

## API and security boundaries

- Parse untrusted responses at an integration boundary: a TypeScript cast does not validate JSON.
- Keep complex business entities independent of external DTOs when semantics differ.
- Enforce critical validation and authorization on the trusted server, not solely in React.
- Keep Next.js server-only modules and credentials out of client bundles.
- Observe the Rules of Hooks; distinguish network failures, cancellation and retry effects.

## Testing

- Colocate unit and component tests with feature code.
- Test pure business rules and application use cases without React or network.
- Favor testing behavior users can observe over internals.
- Use integration/E2E tests for important journeys, authorization states and major framework boundaries.

## Official references

[Keeping components pure](https://react.dev/learn/keeping-components-pure) · [You might not need an Effect](https://react.dev/learn/you-might-not-need-an-effect) · [React Compiler](https://react.dev/learn/react-compiler/introduction) · [TanStack Query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
