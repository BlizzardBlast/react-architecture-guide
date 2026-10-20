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
    renderCheckout({ listOrders: async () => [], placeOrder });
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/customer name/i);
    expect(placeOrder).toHaveBeenCalledOnce();
  });
  it('creates an order and refreshes history', async () => {
    const orders: Array<{ id: string; customerName: string; productId: string; priceCents: number }> = [];
    const service: OrdersService = {
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
