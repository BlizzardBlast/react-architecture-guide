import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductCatalog } from './product-catalog';
it('loads products and notifies the composition caller of selection', async () => {
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProductCatalog onSelect={onSelect} /></QueryClientProvider>);
  await userEvent.click(await screen.findByRole('button', { name: /select green tea/i }));
  expect(onSelect).toHaveBeenCalledWith({ id: 'tea', name: 'Green tea', priceCents: 250 });
});

it('shows an actionable selection button for each seeded product', async () => {
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProductCatalog onSelect={onSelect} /></QueryClientProvider>);
  const tea = await screen.findByRole('button', { name: /select green tea/i });
  const coffee = screen.getByRole('button', { name: /select filter coffee/i });
  expect(tea).toBeEnabled();
  expect(coffee).toBeEnabled();
});
