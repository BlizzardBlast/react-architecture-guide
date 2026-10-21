import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listProducts } from '../api/list-products';
import type { Product } from '../model/product';
import { ProductCatalog } from './product-catalog';

vi.mock('../api/list-products', () => ({ listProducts: vi.fn() }));

const seededProducts: readonly Product[] = [
  { id: 'tea', name: 'Green tea', priceCents: 250 },
  { id: 'coffee', name: 'Filter coffee', priceCents: 375 },
];

function renderCatalog(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProductCatalog onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return { onSelect, client };
}

beforeEach(() => {
  vi.mocked(listProducts).mockReset();
  vi.mocked(listProducts).mockResolvedValue(seededProducts);
});

it('loads products and notifies the composition caller of selection', async () => {
  const { onSelect } = renderCatalog();
  await userEvent.click(await screen.findByRole('button', { name: /select green tea/i }));
  expect(onSelect).toHaveBeenCalledWith({ id: 'tea', name: 'Green tea', priceCents: 250 });
});

it('shows an actionable selection button for each seeded product', async () => {
  renderCatalog();
  const tea = await screen.findByRole('button', { name: /select green tea/i });
  const coffee = screen.getByRole('button', { name: /select filter coffee/i });
  expect(tea).toBeEnabled();
  expect(coffee).toBeEnabled();
});

it('announces a pending catalog request', () => {
  vi.mocked(listProducts).mockReturnValue(new Promise<readonly Product[]>(() => {}));
  renderCatalog();
  expect(screen.getByRole('status')).toHaveTextContent('Loading catalog');
});

it('explains an empty catalog rather than rendering a blank list', async () => {
  vi.mocked(listProducts).mockResolvedValue([]);
  renderCatalog();
  expect(await screen.findByText('No products available.')).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('shows an error and retries a failed catalog request', async () => {
  vi.mocked(listProducts).mockRejectedValueOnce(new Error('offline'));
  vi.mocked(listProducts).mockResolvedValueOnce(seededProducts);
  renderCatalog();
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load catalog");
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: /select green tea/i })).toBeEnabled();
  expect(vi.mocked(listProducts)).toHaveBeenCalledTimes(2);
});

it('gives multiple catalog instances unique accessible heading IDs', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProductCatalog onSelect={vi.fn()} />
      <ProductCatalog onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
  const headings = await screen.findAllByRole('heading', { name: 'Choose a product' });
  expect(headings).toHaveLength(2);
  expect(headings[0].id).not.toBe(headings[1].id);
  expect(headings[0].closest('section')).toHaveAttribute('aria-labelledby', headings[0].id);
  expect(headings[1].closest('section')).toHaveAttribute('aria-labelledby', headings[1].id);
});
