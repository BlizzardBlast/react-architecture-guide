import { assertValidOrder, type OrderDraft, type OrderReceipt } from "../domain/order.js";

// Port owned by the application use case consuming the capability.
export interface OrderWriter {
  create(draft: OrderDraft): Promise<OrderReceipt>;
}

export interface OrderEvents {
  // `void` permits existing synchronous callbacks and async implementations.
  orderPlaced(receipt: OrderReceipt, draft: OrderDraft): void;
}

export function createPlaceOrder(writer: OrderWriter, events: OrderEvents) {
  return async (draft: OrderDraft): Promise<OrderReceipt> => {
    assertValidOrder(draft);
    const receipt = await writer.create(draft);
    // Notification is best effort after the write; it must not trigger a retry.
    try { void Promise.resolve(events.orderPlaced(receipt, draft)).catch(() => {}); }
    catch { /* Synchronous notification failure does not undo the write. */ }
    return receipt;
  };
}
