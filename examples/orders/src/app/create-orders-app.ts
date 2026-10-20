import { createOrders } from "../modules/orders/index.js";
import type { AnalyticsClient } from "../shared/analytics-client.js";

// App-level composition supplies concrete technical dependencies.
// A route can pass placeOrder to a UI component without importing infrastructure.
export function createOrdersApp(fetcher: typeof fetch, analytics: AnalyticsClient) {
  return createOrders({ fetcher, analytics, baseUrl: "/api" });
}
