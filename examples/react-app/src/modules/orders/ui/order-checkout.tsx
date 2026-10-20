import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrdersService } from '../application/orders-service';
export interface OrderSelection { readonly productId: string; readonly productName: string; readonly priceCents: number; }
interface Props { readonly service: OrdersService; readonly selection: OrderSelection | null; }
const orderKey = ['orders', 'local-demo'] as const;
export function OrderCheckout({ service, selection }: Props) {
  const [customerName, setCustomerName] = useState('');
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: orderKey, queryFn: service.listOrders });
  const mutation = useMutation({
    mutationFn: service.placeOrder,
    onSuccess: async () => { setCustomerName(''); await queryClient.invalidateQueries({ queryKey: orderKey }); },
  });
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    mutation.reset();
    mutation.mutate({ customerName, productId: selection.productId, priceCents: selection.priceCents });
  }
  return <section aria-labelledby="checkout-title">
    <h2 id="checkout-title">Place an order</h2>
    <form onSubmit={onSubmit} noValidate>
      <p>{selection ? `Selected: ${selection.productName}` : 'Select a product first.'}</p>
      <label htmlFor="customer">Customer name</label>{' '}
      <input id="customer" name="customer" value={customerName} onChange={e => setCustomerName(e.target.value)} required minLength={2} />{' '}
      <button type="submit" disabled={!selection || mutation.isPending}> {mutation.isPending ? 'Saving…' : 'Place order'} </button>
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
      {mutation.isSuccess && <p role="status">Order saved.</p>}
    </form>
    <h3>Order history</h3>
    {history.isPending ? <p role="status">Loading orders…</p> : history.isError ? <p role="alert">Couldn't load orders. <button type="button" onClick={() => void history.refetch()}>Retry</button></p> : history.data.length === 0 ? <p>No orders yet.</p> : <ul>{history.data.map(order => <li key={order.id}>{order.customerName} — {order.productId}</li>)}</ul>}
  </section>;
}
