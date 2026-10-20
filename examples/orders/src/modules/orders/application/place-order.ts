import { assertValidOrder, type OrderDraft, type OrderReceipt } from "../domain/order.js";

// Port owned by the application use case consuming the capability.
export interface OrderWriter {
  create(draft: OrderDraft): Promise<OrderReceipt>;
}

export interface OrderEvents {
  orderPlaced(receipt: OrderReceipt, draft: OrderDraft): void;
}

export function createPlaceOrder(writer: OrderWriter, events: OrderEvents) {
  return async (draft: OrderDraft): Promise<OrderReceipt> => {
    assertValidOrder(draft);
    const receipt = await writer.create(draft);
    events.orderPlaced(receipt, draft);
    return receipt;
  };
}
