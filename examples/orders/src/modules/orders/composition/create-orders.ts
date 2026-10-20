import { createPlaceOrder } from "../application/place-order.js";
import { createHttpOrderWriter } from "../infrastructure/http-order-writer.js";
import { createOrderAnalytics } from "../infrastructure/order-analytics.js";
import type { AnalyticsClient } from "../../../shared/analytics-client.js";

// This factory is internal to the module. The app imports only its public API.
export function createOrders(deps: {
  fetcher: typeof fetch;
  analytics: AnalyticsClient;
  baseUrl: string;
}) {
  const writer = createHttpOrderWriter(deps.fetcher, deps.baseUrl);
  const events = createOrderAnalytics(deps.analytics);
  return { placeOrder: createPlaceOrder(writer, events) };
}
