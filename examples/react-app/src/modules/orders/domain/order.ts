export interface OrderDraft {
  readonly customerName: string;
  readonly productId: string;
  readonly priceCents: number;
}
export interface OrderReceipt extends OrderDraft {
  readonly id: string;
}
export function validateOrder(draft: OrderDraft): string | null {
  if (draft.customerName.trim().length < 2) return 'Enter a customer name of at least two characters.';
  if (!draft.productId.trim()) return 'Select a product.';
  if (!Number.isSafeInteger(draft.priceCents) || draft.priceCents <= 0) return 'Invalid price.';
  return null;
}
