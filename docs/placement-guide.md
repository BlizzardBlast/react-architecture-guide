# Where should this file go?

Locate code according to **ownership first**, not its syntax. Do not create a global `components/` or `services/` dumping ground.

| Task | Default home |
| --- | --- |
| Route entry point, navigation/search-param orchestration | Framework routes |
| App providers, router/client setup, global composition | `app/` or framework composition point |
| Reusable generic button, input, dialog | `shared/ui/` |
| Generic HTTP transport, retry policy | `shared/api/` |
| Order API request and server-state query options | `modules/orders/api/` (simple mode) |
| Order React component, form, hook | `modules/orders/ui/` |
| Pure order calculation, rules, order-specific types | `modules/orders/model/` (simple) / `domain/` (complex) |
| Place-order workflow using a port | `modules/orders/application/` (complex mode) |
| HTTP repository, DTO mapper, domain telemetry adapter | `modules/orders/infrastructure/` (complex mode) |
| App-wiring of an orders adapter to use case | `app/` or orders-local composition factory |
| Generated OpenAPI schema/client | `generated/api/` or framework-specific generated path |
| Pure shared formatting (not business-specific) | `shared/lib/` |
| Business concept reused across contexts | Owner context or explicitly designed small shared kernel |
| Unit tests | Next to the implementation |
| Test fixtures reusable across modules | `testing/` |

## Five questions before adding a file

1. Does this code use business vocabulary or invariants? **Keep it within its owner.**
2. Does it merely use React? **That doesn't make it globally shared.**
3. Is reuse already real and semantically the same? **Only then consider extraction.**
4. Would extracting this into `shared` cause generic code to import a domain type? **Keep a domain-specific adapter instead.**
5. Is this module complex enough to benefit from ports and separate layers? **If not, use the simple structure.**

## Ambiguous cases

- **Authentication**: shared auth transport can be generic, but identity policies and user/session concepts belong to an identity module. Enforcement is server-side.
- **Permissions**: business-specific permission meanings stay in owner modules; generic UI capability gates aren't authorization enforcement.
- **Analytics**: generic tracker in shared; order event adapter in orders.
- **API DTO types**: use directly for simple CRUD when safe; map to independent domain types when business meanings differ.
- **SWR/TanStack Query hooks**: React-dependent hooks live in UI-facing files; pure application use cases stay React-free.
- **Multiple modules using a generic model**: a user ID string isn't automatically a universal User entity.

Framework-specific routing rules override this table. See [architecture](architecture.md).
