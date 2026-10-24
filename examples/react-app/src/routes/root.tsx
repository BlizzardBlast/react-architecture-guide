import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { OrdersService } from '../modules/orders';
export interface RouterContext { readonly queryClient: QueryClient; readonly orders: OrdersService; }
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <div className="container">
    <header><h1>React architecture reference</h1><nav aria-label="Primary"><Link to="/">Demo</Link>{' · '}<Link to="/about">About</Link></nav></header>
    <main><Outlet /></main>
  </div>,
  notFoundComponent: () => <p role="alert">Page not found.</p>,
});
