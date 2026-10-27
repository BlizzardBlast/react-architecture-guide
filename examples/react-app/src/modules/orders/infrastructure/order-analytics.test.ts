import { expect, it, vi } from 'vitest';
import { createOrdersService, type OrderEvents } from '../application/orders-service';
import type { OrderDraft } from '../domain/order';
import { createOrderAnalytics } from './order-analytics';
import type { AnalyticsSink } from '../../../shared/lib/analytics';

it('accepts synchronous callbacks that return incidental values', () => {
  const calls: string[] = [];
  const sink: AnalyticsSink = { track: name => calls.push(name) };
  const events: OrderEvents = { orderPlaced: () => calls.push('placed') };
  sink.track('tracked', {});
  events.orderPlaced({ customerName: 'Alice', productId: 'tea', priceCents: 250, id: 'saved' });
  expect(calls).toEqual(['tracked', 'placed']);
});

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
