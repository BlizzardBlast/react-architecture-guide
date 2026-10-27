import { validateOrder, type OrderDraft, type OrderReceipt } from '../domain/order';
export interface OrderRepository {
  save(draft: OrderDraft): Promise<OrderReceipt>;
  list(): Promise<readonly OrderReceipt[]>;
}
export interface OrderEvents {
  // Best-effort, synchronous notification after persistence; never part of
  // the order commit. Production-critical delivery needs a durable outbox.
  orderPlaced(receipt: OrderReceipt): void;
}
export function createOrdersService(repo: OrderRepository, events: OrderEvents, scopeId: string) {
  return {
    scopeId,
    listOrders: () => repo.list(),
    async placeOrder(draft: OrderDraft): Promise<OrderReceipt> {
      const error = validateOrder(draft);
      if (error) throw new Error(error);
      const saved = await repo.save(draft);
      // The repository commit has succeeded. A failing optional notification
      // must not report an order failure or invite a duplicate retry.
      try {
        events.orderPlaced(saved);
      } catch {
        // Best-effort demo event: the analytics adapter owns its diagnostics.
      }
      return saved;
    },
  };
}
export type OrdersService = ReturnType<typeof createOrdersService>;
