import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listProducts } from '../api/list-products';
import type { Product } from '../model/product';

export interface ProductCatalogProps {
  onSelect: (product: Product) => void;
}

export function ProductCatalog({ onSelect }: ProductCatalogProps) {
  const headingId = useId();
  const products = useQuery({
    queryKey: ['catalog', 'demo-v1'],
    queryFn: listProducts,
    staleTime: 60_000,
  });

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Choose a product</h2>
      {products.isPending ? (
        <p role="status">Loading catalog…</p>
      ) : products.isError ? (
        <div role="alert">
          Couldn't load catalog.{' '}
          <button type="button" onClick={() => void products.refetch()}>Retry</button>
        </div>
      ) : products.data.length === 0 ? (
        <p>No products available.</p>
      ) : (
        <ul>
          {products.data.map(product => (
            <li key={product.id}>
              <span>{product.name} — ${(product.priceCents / 100).toFixed(2)}</span>{' '}
              <button type="button" onClick={() => onSelect(product)}>
                Select {product.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
