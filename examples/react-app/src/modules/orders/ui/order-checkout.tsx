import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrderValidationError, type OrderValidationIssue } from '../domain/order';
import type { OrdersService } from '../application/orders-service';

export interface OrderSelection {
  readonly productId: string;
  readonly productName: string;
  readonly priceCents: number;
}
interface Props {
  readonly service: OrdersService;
  readonly selection: OrderSelection | null;
}

export function OrderCheckout(props: Props) {
  // A different selected product (or service) represents a new checkout attempt.
  // Remounting clears prior mutation feedback rather than showing "saved" for it.
  const key = [props.service.scopeId, props.selection?.productId ?? '', props.selection?.priceCents ?? 0].join(':');
  return <CheckoutForm key={key} {...props} />;
}

function CheckoutForm({ service, selection }: Props) {
  const [customerName, setCustomerName] = useState('');
  const [validationError, setValidationError] = useState<OrderValidationIssue | null>(null);
  const id = useId();
  const titleId = `${id}-checkout-title`;
  const customerId = `${id}-customer`;
  const customerErrorId = `${id}-customer-error`;
  const orderKey = ['orders', 'local-demo', service.scopeId] as const;
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: orderKey, queryFn: service.listOrders });
  const mutation = useMutation({
    mutationFn: service.placeOrder,
    onSuccess: async () => {
      setCustomerName('');
      await queryClient.invalidateQueries({ queryKey: orderKey });
    },
  });
  const customerNameError = validationError?.field === 'customerName' ? validationError.message : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || mutation.isPending) return;
    const draft = { customerName, productId: selection.productId, priceCents: selection.priceCents };
    const error = getOrderValidationError(draft);
    mutation.reset();
    setValidationError(error);
    if (error) return;
    mutation.mutate(draft);
  }

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId}>Place an order</h2>
      <form onSubmit={onSubmit} noValidate>
        <p>{selection ? `Selected: ` + selection.productName : 'Select a product first.'}</p>
        <label htmlFor={customerId}>Customer name</label>{' '}
        <input
          id={customerId}
          name="customer"
          value={customerName}
          onChange={event => {
            setCustomerName(event.target.value);
            setValidationError(null);
            mutation.reset();
          }}
          required
          minLength={2}
          aria-invalid={Boolean(customerNameError)}
          aria-describedby={customerNameError ? customerErrorId : undefined}
        />{' '}
        <button type="submit" disabled={!selection || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Place order'}
        </button>
        {validationError && <p id={customerNameError ? customerErrorId : undefined} role="alert">{validationError.message}</p>}
        {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        {mutation.isSuccess && <p role="status">Order saved.</p>}
      </form>
      <h3>Order history</h3>
      {history.isPending
        ? <p role="status">Loading orders…</p>
        : history.isError
          ? <p role="alert">Couldn't load orders. <button type="button" onClick={() => void history.refetch()}>Retry</button></p>
          : history.data.length === 0
            ? <p>No orders yet.</p>
            : <ul>{history.data.map(order => <li key={order.id}>{order.customerName} — {order.productId}</li>)}</ul>}
    </section>
  );
}
