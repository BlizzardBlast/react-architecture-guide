export interface OrderDraft {
  readonly customerName: string;
  readonly productId: string;
  readonly priceCents: number;
}
export interface OrderReceipt extends OrderDraft {
  readonly id: string;
}
export type OrderValidationIssue = Readonly<{
  field: 'customerName' | 'productId' | 'priceCents';
  message: string;
}>;
export function getOrderValidationError(draft: OrderDraft): OrderValidationIssue | null {
  if (draft.customerName.trim().length < 2) return { field: 'customerName', message: 'Enter a customer name of at least two characters.' };
  if (!draft.productId.trim()) return { field: 'productId', message: 'Select a product.' };
  if (!Number.isSafeInteger(draft.priceCents) || draft.priceCents <= 0) return { field: 'priceCents', message: 'Invalid price.' };
  return null;
}

// Maintain the small string-returning API while exposing structured field errors.
export function validateOrder(draft: OrderDraft): string | null {
  return getOrderValidationError(draft)?.message ?? null;
}
