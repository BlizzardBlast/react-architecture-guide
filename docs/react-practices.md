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

## Performance and React Compiler

Optimize based on measurement. React Compiler can automatically memoize compatible code when correctly enabled, but behavior and compatibility depend on installed versions and configuration. Don't require blanket `useMemo`, `useCallback`, or `React.memo`; don't remove purposeful optimizations blindly.

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
