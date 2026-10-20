import type { AnalyticsSink } from '../../../shared/lib/analytics';
import type { OrderEvents } from '../application/orders-service';
export function createOrderAnalytics(sink: AnalyticsSink): OrderEvents {
  return {
    orderPlaced(receipt) {
      try { sink.track('order_placed', { orderId: receipt.id, priceCents: receipt.priceCents }); }
      catch { /* Best effort analytics: order was already saved. */ }
    },
  };
}
