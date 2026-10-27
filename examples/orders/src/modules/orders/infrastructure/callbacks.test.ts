import type { OrderEvents } from '../application/place-order.js';
import type { AnalyticsClient } from '../../../shared/analytics-client.js';

// Compile-time consumer controls: incidental synchronous returns and async sinks.
const calls: string[] = [];
export const syncEvents: OrderEvents = { orderPlaced: () => calls.push('placed') };
export const syncAnalytics: AnalyticsClient = { track: name => calls.push(name) };
export const asyncEvents: OrderEvents = { orderPlaced: async () => {} };
export const asyncAnalytics: AnalyticsClient = { track: async () => {} };
