import type { OrderEvents } from "../application/place-order.js";
import type { OrderDraft, OrderReceipt } from "../domain/order.js";
import type { AnalyticsClient } from "../../../shared/analytics-client.js";

// Business-specific telemetry mapping belongs to orders, not shared.
export function createOrderAnalytics(client: AnalyticsClient): OrderEvents {
  return {
    orderPlaced(receipt: OrderReceipt, draft: OrderDraft) {
      try {
        client.track("order_placed", {
          orderId: receipt.orderId,
          totalCents: draft.totalCents,
        });
      } catch {
        // Best-effort telemetry; use a non-throwing production sink or report separately.
      }
    },
  };
}
