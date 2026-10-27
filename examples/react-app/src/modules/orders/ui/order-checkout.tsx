import { useId, useRef, useState, type FormEvent } from 'react';
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

// Rejection reasons are untrusted, including Error.message: never render raw
// transport, stack or server details. Field-validation feedback is separate.
const saveFailureMessage = 'Unable to save the order. Please try again.';

interface SaveGuard {
  readonly isSaving: boolean;
  readonly beginSave: () => boolean;
  readonly finishSave: () => void;
  readonly reportSaveError: (message: string, productName: string) => void;
}

export function OrderCheckout(props: Props) {
  // This guard outlives the keyed form and its mutation observer: changing products
  // must not unlock another save while the first operation remains in flight.
  const inFlight = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  function beginSave() {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSaveError(null);
    setIsSaving(true);
    return true;
  }
  function finishSave() {
    inFlight.current = false;
    setIsSaving(false);
  }
  function reportSaveError(message: string, productName: string) {
    // Hook-level callbacks still run after the keyed form unmounts. Keep the
    // error visible even if a user switches to another product mid-request.
    setSaveError(`Couldn't save ${productName}: ${message}`);
  }
  // Remounting clears previous product's feedback, but not the pending save guard.
  const key = [props.service.scopeId, props.selection?.productId ?? '', props.selection?.priceCents ?? 0].join(':');
  return (
    <>
      <CheckoutForm key={key} {...props} isSaving={isSaving} beginSave={beginSave}
        finishSave={finishSave} reportSaveError={reportSaveError} />
      {saveError && <p role="alert">{saveError}</p>}
    </>
  );
}

function CheckoutForm({ service, selection, isSaving, beginSave, finishSave, reportSaveError }: Props & SaveGuard) {
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
    onSuccess: () => {
      setCustomerName('');
      // A slow history refresh must not keep an already-saved order pending.
      void queryClient.invalidateQueries({ queryKey: orderKey }).catch(() => {});
    },
    onError: () => reportSaveError(saveFailureMessage, selection?.productName ?? 'product'),
    // Mutation reset does not cancel requests. Release the cross-form guard only
    // after the actual asynchronous mutation has settled.
    onSettled: finishSave,
  });
  const customerNameError = validationError?.field === 'customerName' ? validationError.message : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || isSaving || mutation.isPending) return;
    const draft = { customerName, productId: selection.productId, priceCents: selection.priceCents };
    const error = getOrderValidationError(draft);
    mutation.reset();
    setValidationError(error);
    if (error) return;
    if (!beginSave()) return;
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
          disabled={isSaving}
          onChange={event => {
            if (isSaving) return;
            setCustomerName(event.target.value);
            setValidationError(null);
            mutation.reset();
          }}
          required
          minLength={2}
          aria-invalid={Boolean(customerNameError)}
          aria-describedby={customerNameError ? customerErrorId : undefined}
        />{' '}
        <button type="submit" disabled={!selection || isSaving || mutation.isPending}>
          {isSaving || mutation.isPending ? 'Saving…' : 'Place order'}
        </button>
        {validationError && <p id={customerNameError ? customerErrorId : undefined} role="alert">{validationError.message}</p>}
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
