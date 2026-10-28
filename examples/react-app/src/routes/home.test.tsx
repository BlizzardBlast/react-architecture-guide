import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { createOrders } from '../modules/orders';
import { routeTree } from './tree';

// jsdom has no native scrolling/layout implementation. This mock is scoped to
// the router integration test, without masking unrelated errors.
afterEach(() => vi.restoreAllMocks());

it('composes independent catalog and orders modules through a route', { timeout: 15_000 }, async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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
  const selectionStatus = screen.getByText('Select a product first.');
  expect(selectionStatus).toHaveAttribute('role', 'status');
  await userEvent.click(await screen.findByRole('button', { name: /select green tea/i }, queryWait));
  expect(screen.getByText('Selected: Green tea')).toBe(selectionStatus);
  await userEvent.click(screen.getByRole('button', { name: /select filter coffee/i }));
  expect(screen.getByText('Selected: Filter coffee')).toBe(selectionStatus);
  await userEvent.click(screen.getByRole('button', { name: /select green tea/i }));
  expect(screen.getByText('Selected: Green tea')).toBe(selectionStatus);
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: /^place order$/i }));
  expect(await screen.findByText('Alice — tea', {}, queryWait)).toBeInTheDocument();
});
