import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { createOrders } from '../modules/orders';
import { routeTree } from './tree';

it('composes independent catalog and orders modules through a route', { timeout: 15_000 }, async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const orders = createOrders({ track() {} });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient, orders },
    Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });

  await router.load();
  render(<RouterProvider router={router} />);
  const queryWait = { timeout: 5_000 };
  await userEvent.click(await screen.findByRole('button', { name: /select green tea/i }, queryWait));
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: /^place order$/i }));
  expect(await screen.findByText('Alice — tea', {}, queryWait)).toBeInTheDocument();
});
