import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { createOrders } from '../modules/orders';
import { routeTree } from '../routes/tree';
// Client-only demo: a single QueryClient and in-memory OrdersService.
// SSR frameworks must create request-scoped services/clients instead.
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
const orders = createOrders({ track(name, fields) { console.info('demo analytics:', name, fields); } });
export const router = createRouter({ routeTree, context: { queryClient, orders }, defaultPreload: 'intent', defaultPreloadStaleTime: 0, Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
declare module '@tanstack/react-router' { interface Register { router: typeof router; } }
