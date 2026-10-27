import { expect, it, vi } from 'vitest';
import { createOrdersService } from '../application/orders-service';
import type { OrderDraft } from '../domain/order';
import { createOrderAnalytics } from './order-analytics';

it('handles an asynchronous analytics failure after the order is saved', async () => {
  let rejectDelivery!: (reason: Error) => void;
  const delivery = new Promise<void>((_resolve, reject) => { rejectDelivery = reject; });
  const track = vi.fn(() => delivery);
  const save = vi.fn(async (draft: OrderDraft) => ({ ...draft, id: 'saved' }));
  const events = createOrderAnalytics({ track });
  const service = createOrdersService({ save, list: async () => [] }, events, 'test');
  const draft = { customerName: 'Alice', productId: 'tea', priceCents: 250 };

  expect(events.orderPlaced({ ...draft, id: 'saved' })).toBe(delivery);
  await expect(service.placeOrder(draft)).resolves.toEqual({ ...draft, id: 'saved' });
  expect(save).toHaveBeenCalledOnce();
  expect(track).toHaveBeenCalledTimes(2);
  expect(track).toHaveBeenCalledWith('order_placed', { orderId: 'saved', priceCents: 250 });
  rejectDelivery(new Error('analytics unavailable'));
  await new Promise(resolve => setTimeout(resolve, 0));
});
