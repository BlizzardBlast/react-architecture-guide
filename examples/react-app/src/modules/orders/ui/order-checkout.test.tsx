import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderCheckout } from './order-checkout';
import type { OrdersService } from '../application/orders-service';
function renderCheckout(service: OrdersService) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OrderCheckout service={service} selection={{ productId: 'tea', productName: 'Green tea', priceCents: 250 }} /></QueryClientProvider>);
}
describe('OrderCheckout', () => {
  it('shows application validation errors', async () => {
    const placeOrder = vi.fn().mockRejectedValue(new Error('Enter a customer name of at least two characters.'));
    renderCheckout({ scopeId: 'invalid-test', listOrders: async () => [], placeOrder });
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/customer name/i);
    expect(placeOrder).toHaveBeenCalledOnce();
  });
  it('creates an order and refreshes history', async () => {
    const orders: Array<{ id: string; customerName: string; productId: string; priceCents: number }> = [];
    const service: OrdersService = {
      scopeId: 'happy-test',
      listOrders: async () => [...orders],
      placeOrder: async draft => {
        const saved = { ...draft, id: 'receipt-1' };
        orders.push(saved);
        return saved;
      },
    };
    renderCheckout(service);
    await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByText('Alice — tea')).toBeInTheDocument();
  });
});

// This matters for dependency injection: changing services must not reuse a prior source's cache.
it('separates query-cache data when the injected service changes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const first: OrdersService = {
    scopeId: 'first-store', placeOrder: async () => { throw new Error('not used'); },
    listOrders: async () => [{ id: 'first', productId: 'tea', customerName: 'From A', priceCents: 250 }],
  };
  const second: OrdersService = {
    scopeId: 'second-store', placeOrder: async () => { throw new Error('not used'); },
    listOrders: async () => [{ id: 'second', productId: 'tea', customerName: 'From B', priceCents: 250 }],
  };
  const selection = { productId: 'tea', productName: 'Green tea', priceCents: 250 };
  const { rerender } = render(<QueryClientProvider client={client}><OrderCheckout service={first} selection={selection} /></QueryClientProvider>);
  expect(await screen.findByText('From A — tea')).toBeInTheDocument();
  rerender(<QueryClientProvider client={client}><OrderCheckout service={second} selection={selection} /></QueryClientProvider>);
  expect(await screen.findByText('From B — tea')).toBeInTheDocument();
  expect(screen.queryByText('From A — tea')).not.toBeInTheDocument();
});
it('handles history errors and retry without leaking an exception', async () => {
  let calls = 0;
  const service: OrdersService = {
    scopeId: 'failed-history',
    placeOrder: async () => { throw new Error('unused'); },
    listOrders: async () => { calls++; if (calls === 1) throw new Error('temporary'); return []; },
  };
  renderCheckout(service);
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load orders/i);
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(await screen.findByText(/no orders yet/i)).toBeInTheDocument();
});
