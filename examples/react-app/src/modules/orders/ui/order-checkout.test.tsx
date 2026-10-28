import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderCheckout } from './order-checkout';
import type { OrdersService } from '../application/orders-service';
function renderCheckout(service: OrdersService) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OrderCheckout service={service} selection={{ productId: 'tea', productName: 'Green tea', priceCents: 250 }} /></QueryClientProvider>);
}
describe('OrderCheckout', () => {
  it('shows application validation errors', async () => {
    const placeOrder = vi.fn().mockRejectedValue(new Error('Enter a customer name of at least two characters.'));
    renderCheckout({ scopeId: 'invalid-test', listOrders: async () => [], placeOrder });
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/customer name/i);
    expect(placeOrder).not.toHaveBeenCalled();
    const field = screen.getByRole('textbox', { name: /customer name/i });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const messageId = field.getAttribute('aria-describedby');
    expect(messageId).toBeTruthy();
    expect(document.getElementById(messageId!)).toHaveTextContent(/customer name/i);
  });
  it('creates an order and refreshes history', async () => {
    const orders: Array<{ id: string; customerName: string; productId: string; priceCents: number }> = [];
    const service: OrdersService = {
      scopeId: 'happy-test',
      listOrders: async () => [...orders],
      placeOrder: async draft => {
        const saved = { ...draft, id: 'receipt-1' };
        orders.push(saved);
        return saved;
      },
    };
    renderCheckout(service);
    await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByText('Alice — tea')).toBeInTheDocument();
  });
});

// This matters for dependency injection: changing services must not reuse a prior source's cache.
it('separates query-cache data when the injected service changes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const first: OrdersService = {
    scopeId: 'first-store', placeOrder: async () => { throw new Error('not used'); },
    listOrders: async () => [{ id: 'first', productId: 'tea', customerName: 'From A', priceCents: 250 }],
  };
  const second: OrdersService = {
    scopeId: 'second-store', placeOrder: async () => { throw new Error('not used'); },
    listOrders: async () => [{ id: 'second', productId: 'tea', customerName: 'From B', priceCents: 250 }],
  };
  const selection = { productId: 'tea', productName: 'Green tea', priceCents: 250 };
  const { rerender } = render(<QueryClientProvider client={client}><OrderCheckout service={first} selection={selection} /></QueryClientProvider>);
  expect(await screen.findByText('From A — tea')).toBeInTheDocument();
  rerender(<QueryClientProvider client={client}><OrderCheckout service={second} selection={selection} /></QueryClientProvider>);
  expect(await screen.findByText('From B — tea')).toBeInTheDocument();
  expect(screen.queryByText('From A — tea')).not.toBeInTheDocument();
});

it.each(['success', 'failure'] as const)('clears completed %s feedback when the service scope changes', async outcome => {
  const first: OrdersService = {
    scopeId: 'feedback-A', listOrders: async () => [],
    placeOrder: async draft => {
      if (outcome === 'failure') throw new Error('failed');
      return { ...draft, id: 'first' };
    },
  };
  const second: OrdersService = {
    scopeId: 'feedback-B', listOrders: async () => [],
    placeOrder: async draft => ({ ...draft, id: 'second' }),
  };
  const tea = { productId: 'tea', productName: 'Source A tea', priceCents: 250 };
  const coffee = { productId: 'coffee', productName: 'Source B coffee', priceCents: 375 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (service: OrdersService, selection: typeof tea) => (
    <QueryClientProvider client={client}><OrderCheckout service={service} selection={selection} /></QueryClientProvider>
  );
  const { rerender } = render(view(first, tea));
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  if (outcome === 'success') expect(await screen.findByText('Order saved.')).toHaveTextContent('Source A tea');
  else expect(await screen.findByRole('alert')).toHaveTextContent('Source A tea');
  rerender(view(second, coffee));
  expect(screen.queryByText('Order saved.')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  rerender(view(first, tea));
  expect(screen.queryByText('Order saved.')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each([
  ['success', false], ['success', true], ['failure', false], ['failure', true],
] as const)('isolates pending %s feedback after a scope switch (return: %s)', async (outcome, returnToFirst) => {
  type Receipt = Awaited<ReturnType<OrdersService['placeOrder']>>;
  let resolve!: (receipt: Receipt) => void;
  let reject!: (reason: Error) => void;
  const pending = new Promise<Receipt>((yes, no) => { resolve = yes; reject = no; });
  const firstSave = vi.fn().mockReturnValueOnce(pending)
    .mockImplementation(async (draft: Parameters<OrdersService['placeOrder']>[0]) => ({ ...draft, id: 'retry' }));
  const secondSave = vi.fn(async (draft: Parameters<OrdersService['placeOrder']>[0]) => ({ ...draft, id: 'second' }));
  const first: OrdersService = { scopeId: 'pending-A', listOrders: async () => [], placeOrder: firstSave };
  const second: OrdersService = { scopeId: 'pending-B', listOrders: async () => [], placeOrder: secondSave };
  const tea = { productId: 'tea', productName: 'Source A tea', priceCents: 250 };
  const coffee = { productId: 'coffee', productName: 'Source B coffee', priceCents: 375 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (service: OrdersService, selection: typeof tea) => (
    <QueryClientProvider client={client}><OrderCheckout service={service} selection={selection} /></QueryClientProvider>
  );
  const { rerender } = render(view(first, tea));
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  rerender(view(second, coffee));
  if (returnToFirst) rerender(view(first, tea));
  expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /saving/i }));
  expect(firstSave).toHaveBeenCalledTimes(1);
  expect(secondSave).not.toHaveBeenCalled();
  await act(async () => {
    if (outcome === 'success') resolve({ customerName: 'Alice', productId: 'tea', priceCents: 250, id: 'first' });
    else reject(new Error('failed'));
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled());
  expect(screen.queryByText('Order saved.')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Bob');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  expect(await screen.findByText('Order saved.')).toHaveTextContent(returnToFirst ? 'Source A tea' : 'Source B coffee');
});

it('resets the form across scope and product identities containing delimiters', async () => {
  const first: OrdersService = {
    scopeId: 'shop:west', listOrders: async () => [],
    placeOrder: async draft => ({ ...draft, id: 'first' }),
  };
  const second: OrdersService = {
    scopeId: 'shop', listOrders: async () => [],
    placeOrder: async draft => ({ ...draft, id: 'second' }),
  };
  const tea = { productId: 'tea', productName: 'Tea', priceCents: 250 };
  const otherTea = { productId: 'west:tea', productName: 'Other tea', priceCents: 250 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (service: OrdersService, selection: typeof tea) => (
    <QueryClientProvider client={client}><OrderCheckout service={service} selection={selection} /></QueryClientProvider>
  );
  const { rerender } = render(view(first, tea));
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  rerender(view(first, { ...tea }));
  expect(screen.getByRole('textbox', { name: /customer name/i })).toHaveValue('Alice');
  rerender(view(second, otherTea));
  expect(screen.getByText('Selected: Other tea')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /customer name/i })).toHaveValue('');
});
it('handles history errors and retry without leaking an exception', async () => {
  let calls = 0;
  const service: OrdersService = {
    scopeId: 'failed-history',
    placeOrder: async () => { throw new Error('unused'); },
    listOrders: async () => { calls++; if (calls === 1) throw new Error('temporary'); return []; },
  };
  renderCheckout(service);
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load orders/i);
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(await screen.findByText(/no orders yet/i)).toBeInTheDocument();
});

it('finishes saving while the order history refresh remains pending', async () => {
  let releaseRefresh!: (orders: Awaited<ReturnType<OrdersService['listOrders']>>) => void;
  const refresh = new Promise<Awaited<ReturnType<OrdersService['listOrders']>>>(resolve => { releaseRefresh = resolve; });
  const listOrders = vi.fn().mockResolvedValueOnce([]).mockReturnValue(refresh);
  const placeOrder = vi.fn(async (draft: Parameters<OrdersService['placeOrder']>[0]) => ({ ...draft, id: 'saved' }));
  renderCheckout({ scopeId: 'slow-history', listOrders, placeOrder });
  await screen.findByText('No orders yet.');
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Order saved.', {}, { timeout: 2000 })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled();
  expect(placeOrder).toHaveBeenCalledOnce();
  releaseRefresh([]);
});

it('refreshes after saves even while older history requests are pending', async () => {
  type Receipt = Awaited<ReturnType<OrdersService['placeOrder']>>;
  let releaseInitial!: (orders: readonly Receipt[]) => void;
  let releaseFirstRefresh!: (orders: readonly Receipt[]) => void;
  const initial = new Promise<readonly Receipt[]>(resolve => { releaseInitial = resolve; });
  const firstRefresh = new Promise<readonly Receipt[]>(resolve => { releaseFirstRefresh = resolve; });
  const orders: Receipt[] = [];
  const listOrders = vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(firstRefresh)
    .mockImplementation(async () => [...orders]);
  const placeOrder = vi.fn(async (draft: Parameters<OrdersService['placeOrder']>[0]) => {
    const saved = { ...draft, id: 'saved-' + (orders.length + 1) };
    orders.push(saved);
    return saved;
  });
  renderCheckout({ scopeId: 'pending-history', listOrders, placeOrder });
  await screen.findByText('Loading orders…');
  const name = screen.getByRole('textbox', { name: /customer name/i });
  await userEvent.type(name, 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  await screen.findByText('Order saved.');
  await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled();
  await userEvent.type(name, 'Bob');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(3));
  expect(await screen.findByText('Alice — tea')).toBeInTheDocument();
  expect(await screen.findByText('Bob — tea')).toBeInTheDocument();
  await act(async () => { releaseInitial([]); releaseFirstRefresh([orders[0]!]); });
  expect(screen.getByText('Alice — tea')).toBeInTheDocument();
  expect(screen.getByText('Bob — tea')).toBeInTheDocument();
  expect(placeOrder).toHaveBeenCalledTimes(2);
});

it('keeps the saved order successful when history refresh fails and retries', async () => {
  const listOrders = vi.fn().mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error('history unavailable')).mockResolvedValueOnce([]);
  const placeOrder = vi.fn(async (draft: Parameters<OrdersService['placeOrder']>[0]) => ({ ...draft, id: 'saved' }));
  renderCheckout({ scopeId: 'failed-refresh', listOrders, placeOrder });
  await screen.findByText('No orders yet.');
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  expect(await screen.findByText('Order saved.')).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load orders");
  expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
  expect(placeOrder).toHaveBeenCalledOnce();
});

it('identifies the saved product until the customer edits a new order', async () => {
  const service: OrdersService = {
    scopeId: 'selection-switch',
    listOrders: async () => [],
    placeOrder: async draft => ({ ...draft, id: 'saved-1' }),
  };
  const first = { productId: 'tea', productName: 'Green tea', priceCents: 250 };
  const second = { productId: 'coffee', productName: 'Coffee', priceCents: 375 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { rerender } = render(
    <QueryClientProvider client={client}><OrderCheckout service={service} selection={first} /></QueryClientProvider>,
  );
  const checkout = screen.getByRole('region', { name: 'Place an order' });
  const successStatus = Array.from(checkout.querySelectorAll('[role="status"]'))
    .find(element => !element.textContent);
  expect(successStatus).toBeInTheDocument();
  expect(successStatus).toBeEmptyDOMElement();
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: /place order/i }));
  expect(await screen.findByText('Order saved.')).toBe(successStatus);
  expect(successStatus).toHaveTextContent('Green tea');
  rerender(
    <QueryClientProvider client={client}><OrderCheckout service={service} selection={second} /></QueryClientProvider>,
  );
  expect(screen.getByText('Order saved.')).toBe(successStatus);
  expect(successStatus).toHaveTextContent('Green tea');
  expect(screen.getByText(/selected: coffee/i)).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'B');
  expect(successStatus).toBeEmptyDOMElement();
});
it('clears field-level error when the user corrects the input', async () => {
  const placeOrder = vi.fn();
  renderCheckout({ scopeId: 'aria-reset', listOrders: async () => [], placeOrder });
  await userEvent.click(screen.getByRole('button', { name: /place order/i }));
  const field = screen.getByRole('textbox', { name: /customer name/i });
  expect(field).toHaveAttribute('aria-invalid', 'true');
  await userEvent.type(field, 'Alice');
  expect(field).toHaveAttribute('aria-invalid', 'false');
  expect(field).not.toHaveAttribute('aria-describedby');
  expect(screen.queryByText(/enter a customer name/i)).not.toBeInTheDocument();
});

it('uses unique labels and error associations for multiple checkout instances', async () => {
  const service: OrdersService = {
    scopeId: 'accessible-ids',
    listOrders: async () => [],
    placeOrder: async () => { throw new Error('unused'); },
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}>
    <OrderCheckout service={service} selection={{ productId: 'tea', productName: 'Tea', priceCents: 100 }} />
    <OrderCheckout service={service} selection={{ productId: 'coffee', productName: 'Coffee', priceCents: 200 }} />
  </QueryClientProvider>);
  const fields = screen.getAllByRole('textbox', { name: /customer name/i });
  expect(fields).toHaveLength(2);
  expect(fields[0].id).not.toBe(fields[1].id);
  const forms = screen.getAllByRole('button', { name: /place order/i });
  await userEvent.click(forms[0]);
  expect(fields[0]).toHaveAttribute('aria-invalid', 'true');
  expect(fields[1]).toHaveAttribute('aria-invalid', 'false');
  const description = fields[0].getAttribute('aria-describedby');
  expect(description).toBeTruthy();
  expect(document.getElementById(description!)).toHaveTextContent(/customer name/i);
});

it('keeps one order in flight while the customer tries to edit and resubmit', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const placeOrder = vi.fn(async (draft: Parameters<OrdersService['placeOrder']>[0]) => {
    await gate;
    return { ...draft, id: 'one-order' };
  });
  const service: OrdersService = {
    scopeId: 'single-flight-edit',
    listOrders: async () => [],
    placeOrder,
  };
  renderCheckout(service);
  const name = screen.getByRole('textbox', { name: /customer name/i });
  await userEvent.type(name, 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  expect(placeOrder).toHaveBeenCalledTimes(1);
  expect(name).toBeDisabled();
  expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  await userEvent.type(name, 'Different name');
  expect(name).toHaveValue('Alice');
  await userEvent.click(screen.getByRole('button', { name: /saving/i }));
  expect(placeOrder).toHaveBeenCalledTimes(1);
  release();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled());
  expect(await screen.findByText('Order saved.')).toBeInTheDocument();
});

it('retains a pending save across a product-selection remount', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const placeOrder = vi.fn(async (draft: Parameters<OrdersService['placeOrder']>[0]) => {
    await gate;
    return { ...draft, id: 'saved-order' };
  });
  const service: OrdersService = {
    scopeId: 'single-flight-product-change',
    listOrders: async () => [],
    placeOrder,
  };
  const provider = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const first = { productId: 'tea', productName: 'Green tea', priceCents: 250 };
  const second = { productId: 'coffee', productName: 'Coffee', priceCents: 375 };
  const view = (selection: typeof first) => (
    <QueryClientProvider client={provider}>
      <OrderCheckout service={service} selection={selection} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(first));
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  expect(placeOrder).toHaveBeenCalledTimes(1);
  rerender(view(second));
  expect(screen.getByText(/selected: coffee/i)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /customer name/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /saving/i }));
  expect(placeOrder).toHaveBeenCalledTimes(1);
  release();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled());
  expect(await screen.findByText('Order saved.')).toHaveTextContent('Green tea');
  expect(screen.getByText(/selected: coffee/i)).toBeInTheDocument();
});

it('releases the save guard and permits retry after a rejected save', async () => {
  let rejectSave!: (error: Error) => void;
  const pending = new Promise<Awaited<ReturnType<OrdersService['placeOrder']>>>(
    (_resolve, reject) => { rejectSave = reject; },
  );
  const placeOrder = vi.fn()
    .mockImplementationOnce(() => pending)
    .mockImplementation(async (draft: Parameters<OrdersService['placeOrder']>[0]) => ({
      ...draft, id: 'retried-order',
    }));
  const service: OrdersService = {
    scopeId: 'single-flight-rejected',
    listOrders: async () => [],
    placeOrder,
  };
  renderCheckout(service);
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  expect(placeOrder).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  rejectSave(new Error('Service temporarily unavailable'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save the order. Please try again.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  expect(placeOrder).toHaveBeenCalledTimes(2);
  expect(await screen.findByText('Order saved.')).toBeInTheDocument();
});

it.each([
  ['string', 'unexpected rejection'],
  ['null', null],
  ['object', { reason: 'private transport error' }],
  ['empty Error', new Error('')],
  ['Error with internal details', new Error('private bearer token=secret')],
  ['Error with a non-string message', Object.defineProperty(new Error('private'), 'message', { value: null })],
  ['Error with a throwing message getter', Object.defineProperty(new Error('private'), 'message', {
    get() { throw new Error('private message getter'); },
  })],
])('handles a %s rejection safely and permits retry', async (_label, rejected) => {
  const placeOrder = vi.fn()
    .mockRejectedValueOnce(rejected)
    .mockImplementation(async (draft: Parameters<OrdersService['placeOrder']>[0]) => ({
      ...draft, id: 'retried-after-unknown-rejection',
    }));
  renderCheckout({ scopeId: 'unknown-rejection', listOrders: async () => [], placeOrder });
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't save Green tea: Unable to save the order. Please try again.",
  );
  expect(screen.queryByText(/private transport error|unexpected rejection|bearer token|private message getter/i)).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  expect(placeOrder).toHaveBeenCalledTimes(2);
  expect(await screen.findByText('Order saved.')).toBeInTheDocument();
});

it('keeps a prior product save failure visible after switching products mid-flight', async () => {
  let fail!: (error: Error) => void;
  const pending = new Promise<Awaited<ReturnType<OrdersService['placeOrder']>>>(
    (_resolve, reject) => { fail = reject; },
  );
  const placeOrder = vi.fn().mockImplementation(() => pending);
  const service: OrdersService = {
    scopeId: 'old-product-rejection',
    listOrders: async () => [],
    placeOrder,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tea = { productId: 'tea', productName: 'Green tea', priceCents: 250 };
  const coffee = { productId: 'coffee', productName: 'Coffee', priceCents: 375 };
  const view = (selection: typeof tea) => (
    <QueryClientProvider client={client}>
      <OrderCheckout service={service} selection={selection} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(tea));
  await userEvent.type(screen.getByRole('textbox', { name: /customer name/i }), 'Alice');
  await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
  rerender(view(coffee));
  expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  fail(new Error('Network unavailable'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/green tea.*unable to save the order/i);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled());
  expect(placeOrder).toHaveBeenCalledTimes(1);
});
