export interface OrderDraft {
  readonly customerId: string;
  readonly totalCents: number;
}

export interface OrderReceipt {
  readonly orderId: string;
}

export function assertValidOrder(draft: OrderDraft): void {
  if (!draft.customerId.trim()) {
    throw new Error("Customer ID is required");
  }
  if (!Number.isSafeInteger(draft.totalCents) || draft.totalCents <= 0) {
    throw new Error("Order total must be a positive integer number of cents");
  }
}
