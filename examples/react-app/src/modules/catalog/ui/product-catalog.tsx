import { useQuery } from '@tanstack/react-query';
import { listProducts } from '../api/list-products';
import type { Product } from '../model/product';

export interface ProductCatalogProps {
  onSelect: (product: Product) => void;
}
export function ProductCatalog({ onSelect }: ProductCatalogProps) {
  const products = useQuery({
    queryKey: ['catalog', 'demo-v1'],
    queryFn: listProducts,
    staleTime: 60_000,
  });
  if (products.isPending) return <p role="status">Loading catalog…</p>;
  if (products.isError) return <div role="alert">Couldn't load catalog. <button type="button" onClick={() => void products.refetch()}>Retry</button></div>;
  return (
    <section aria-labelledby="catalog-title">
      <h2 id="catalog-title">Choose a product</h2>
      <ul>{products.data.map(product => (
        <li key={product.id}>
          <span>{product.name} — ${(product.priceCents / 100).toFixed(2)}</span>{' '}
          <button type="button" onClick={() => onSelect(product)}>Select {product.name}</button>
        </li>
      ))}</ul>
    </section>
  );
}
