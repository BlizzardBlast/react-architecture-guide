# References and provenance

This architecture is an independent synthesis. Source material supports principles; it does not prescribe every folder, interface placement or library choice adopted here.

## References supplied by the project requester

1. **DDD React.pdf — "Summary: A Guide to DDD-Inspired Architecture in React".** A two-page reference supplied in the originating discussion. It describes bounded contexts, pure domain models, application/use-case orchestration, infrastructure adapters, UI, dependency inversion and composition. Adopted: separation and inward dependencies for complex domains. Modified: four layers are optional; application ports are owned by consuming use cases by default; React-specific SWR/TanStack Query hooks belong in UI-facing code. Generated API DTO types need not be domain entities.
2. **Jay Freestone, [The "generic" circular dependency problem](https://www.jayfreestone.com/writing/the-generic-circular-dependency-problem).** Relevant to conceptual/type-only coupling and business knowledge leaking into generic services. Adopted rule: `shared` must remain business-neutral and domain-owned adapters translate entity details to generic capabilities. This is an attributed influence, not a reproduction of the article.

The supplied PDF is **not republished** here.

## Primary documentation and adjacent architectures

- [React — Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- [React — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React Compiler](https://react.dev/learn/react-compiler/introduction)
- [TanStack Query — Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
- [Redux Style Guide](https://redux.js.org/style-guide/)
- [Feature-Sliced Design — Layers](https://feature-sliced.design/docs/reference/layers)
- [Feature-Sliced Design — Public API](https://feature-sliced.design/docs/get-started/tutorial)
- [Next.js App Router — Project Organization](https://nextjs.org/docs/app/getting-started/project-structure)
- [Bulletproof React](https://github.com/alan2207/bulletproof-react)
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)

## Choices made by this guide

- Use `modules/` as a neutral business-capability term instead of claiming every module is a bounded context.
- Prefer a simple internal organization; promote only selected modules to Clean Architecture layering.
- Consumer-owned ports, narrow module APIs and explicit composition.
- Distinguish runtime cycles and source-level type-only/conceptual cycles.
- Avoid spending GitHub Actions minutes on repeated unreviewed small pushes.

Check version-specific framework documentation for the **installed version** rather than assuming guidance is timeless.
