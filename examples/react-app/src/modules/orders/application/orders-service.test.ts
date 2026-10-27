import { describe, expect, it, vi } from 'vitest';
import { createOrdersService, type OrderEvents, type OrderRepository } from './orders-service';
import type { OrderDraft, OrderReceipt } from '../domain/order';

const draft: OrderDraft = { customerName: 'Alice', productId: 'tea', priceCents: 250 };
const receipt: OrderReceipt = { ...draft, id: 'saved-once' };

describe('orders service post-save notification contract', () => {
  it('returns the committed receipt when a best-effort notification throws', async () => {
    const save = vi.fn(async () => receipt);
    const events: OrderEvents = {
      orderPlaced: vi.fn(() => { throw new Error('optional analytics unavailable'); }),
    };
    const repo: OrderRepository = { save, list: async () => [] };
    const service = createOrdersService(repo, events, 'store-a');

    await expect(service.placeOrder(draft)).resolves.toEqual(receipt);
    expect(save).toHaveBeenCalledOnce();
    expect(events.orderPlaced).toHaveBeenCalledWith(receipt);
  });

  it('returns the committed receipt despite a rejected asynchronous event', async () => {
    const save = vi.fn(async () => receipt);
    let rejectEvent!: (reason: Error) => void;
    const eventDelivery = new Promise<void>((_resolve, reject) => {
      rejectEvent = reject;
    });
    const events: OrderEvents = { orderPlaced: vi.fn(() => eventDelivery) };
    const repo: OrderRepository = { save, list: async () => [] };
    const service = createOrdersService(repo, events, 'async-store');

    await expect(service.placeOrder(draft)).resolves.toEqual(receipt);
    expect(events.orderPlaced).toHaveBeenCalledWith(receipt);
    rejectEvent(new Error('analytics failed asynchronously'));
    await Promise.resolve();
    expect(save).toHaveBeenCalledOnce();
  });

  it('does not notify or report success when persistence fails', async () => {
    const failure = new Error('persistence failed');
    const repo: OrderRepository = {
      save: async () => { throw failure; },
      list: async () => [],
    };
    const events: OrderEvents = { orderPlaced: vi.fn() };

    await expect(createOrdersService(repo, events, 'store-b').placeOrder(draft)).rejects.toBe(failure);
    expect(events.orderPlaced).not.toHaveBeenCalled();
  });

  it('rejects invalid input before persistence or event notification', async () => {
    const save = vi.fn(async () => receipt);
    const events: OrderEvents = { orderPlaced: vi.fn() };
    const repo: OrderRepository = { save, list: async () => [] };

    await expect(createOrdersService(repo, events, 'store-c').placeOrder({
      ...draft, customerName: '',
    })).rejects.toThrow(/customer name/i);
    expect(save).not.toHaveBeenCalled();
    expect(events.orderPlaced).not.toHaveBeenCalled();
  });
});
