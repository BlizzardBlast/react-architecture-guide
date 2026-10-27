import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './root';
export const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/about', component: () => <section><h2>Architecture notes</h2><p>The catalog uses the simple module layout. Orders uses domain, application, infrastructure, UI and an explicit composition factory.</p><p>Both are demonstration-only: in-memory orders are not persistent or server-authorized.</p></section> });
