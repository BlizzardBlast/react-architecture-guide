import type { OrderRepository } from '../application/orders-service';
import type { OrderDraft, OrderReceipt } from '../domain/order';
// In-memory data survives client-side navigation but not browser refresh.
export function createMemoryOrderRepository(): OrderRepository {
  const orders: OrderReceipt[] = [];
  return {
    async save(draft: OrderDraft): Promise<OrderReceipt> {
      const receipt: OrderReceipt = { ...draft, id: crypto.randomUUID() };
      orders.push(receipt);
      return receipt;
    },
    async list() { return [...orders]; },
  };
}
