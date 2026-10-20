import { validateOrder, type OrderDraft, type OrderReceipt } from '../domain/order';
export interface OrderRepository {
  save(draft: OrderDraft): Promise<OrderReceipt>;
  list(): Promise<readonly OrderReceipt[]>;
}
export interface OrderEvents {
  orderPlaced(receipt: OrderReceipt): void;
}
export function createOrdersService(repo: OrderRepository, events: OrderEvents) {
  return {
    listOrders: () => repo.list(),
    async placeOrder(draft: OrderDraft): Promise<OrderReceipt> {
      const error = validateOrder(draft);
      if (error) throw new Error(error);
      const saved = await repo.save(draft);
      events.orderPlaced(saved);
      return saved;
    },
  };
}
export type OrdersService = ReturnType<typeof createOrdersService>;
