import { validateOrder, type OrderDraft, type OrderReceipt } from '../domain/order';
export interface OrderRepository {
  save(draft: OrderDraft): Promise<OrderReceipt>;
  list(): Promise<readonly OrderReceipt[]>;
}
export interface OrderEvents {
  // Best-effort notification after persistence, synchronous or asynchronous.
  // Failures never roll back the committed order; critical delivery needs an outbox.
  orderPlaced(receipt: OrderReceipt): void | Promise<void>;
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
        // Attach rejection handling immediately, without delaying order success.
        // Optional analytics owns any logging; the demo does not report failures
        // as save errors, even when an implementation returns a Promise.
        void Promise.resolve(events.orderPlaced(saved)).catch(() => {});
      } catch {
        // Synchronous callbacks can throw before producing a Promise.
      }
      return saved;
    },
  };
}
export type OrdersService = ReturnType<typeof createOrdersService>;
