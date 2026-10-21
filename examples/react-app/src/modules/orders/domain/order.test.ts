import { describe, expect, it } from 'vitest';
import { validateOrder } from './order';
describe('order rules', () => {
  it('requires a valid customer name and price', () => {
    expect(validateOrder({ customerName: ' ', productId: 'tea', priceCents: 250 })).toMatch(/name/);
    expect(validateOrder({ customerName: 'Alice', productId: 'tea', priceCents: 1.5 })).toMatch(/price/);
    expect(validateOrder({ customerName: 'Alice', productId: 'tea', priceCents: 250 })).toBeNull();
  });
});

it('rejects empty product IDs and out-of-range prices', () => {
  expect(validateOrder({ customerName: 'Alice', productId: ' ', priceCents: 250 })).toMatch(/product/i);
  expect(validateOrder({ customerName: 'Alice', productId: 'tea', priceCents: -5 })).toMatch(/price/i);
  expect(validateOrder({ customerName: 'Alice', productId: 'tea', priceCents: Number.MAX_SAFE_INTEGER + 1 })).toMatch(/price/i);
});
