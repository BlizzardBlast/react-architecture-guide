import type { AnalyticsSink } from '../../../shared/lib/analytics';
import { createOrdersService } from '../application/orders-service';
import { createMemoryOrderRepository } from '../infrastructure/memory-order-repository';
import { createOrderAnalytics } from '../infrastructure/order-analytics';
// Module factory hides implementation paths from app/route consumers.
export function createOrders(sink: AnalyticsSink) {
  return createOrdersService(createMemoryOrderRepository(), createOrderAnalytics(sink));
}
