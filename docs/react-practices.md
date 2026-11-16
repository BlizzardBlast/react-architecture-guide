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

For modernization work, identify a concrete accessibility, maintainability, security or user-visible performance benefit before changing working code. The optional [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance/modernization-workflow) `legacy-scan` only detects a limited set of patterns: treat matches as **review candidates**, not proven defects or authorization to edit. Inspect surrounding code, intentional fallbacks, component contracts and project requirements. Do not add an unapproved tool installation, automatic rewrite or mandatory CI scanner.

Verify the changed behavior in supported browsers and relevant input modes/preferences (for example keyboard focus, touch, screen readers, IME text composition and reduced motion). Use runtime evidence for rendering and performance claims. Record any unavailable browser checks and keep a working fallback rather than claiming compatibility from static analysis.

## Performance and React Compiler

Optimize based on measurement. React Compiler can automatically memoize compatible code when correctly enabled, but behavior and compatibility depend on installed versions and configuration. Don't require blanket `useMemo`, `useCallback`, or `React.memo`; don't remove purposeful optimizations blindly.

Treat costly shared UI interactions (such as large comboboxes and bulk-selection controls) as part of the shared component's performance contract. Define realistic workloads, maintain keyboard/screen-reader usability, and measure the interaction rather than inferring speed from bundle size. See [interaction performance contracts](interaction-performance.md).

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
