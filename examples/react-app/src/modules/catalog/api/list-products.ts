import type { Product } from '../model/product';

// Demo-only asynchronous data. Replace with a validated backend adapter in a real app.
export async function listProducts(): Promise<readonly Product[]> {
  return [
    { id: 'tea', name: 'Green tea', priceCents: 250 },
    { id: 'coffee', name: 'Filter coffee', priceCents: 375 },
  ];
}
