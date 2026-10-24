import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { ProductCatalog, type Product } from '../modules/catalog';
import { OrderCheckout, type OrderSelection } from '../modules/orders';
import { rootRoute } from './root';
function DemoPage() {
  const { orders } = homeRoute.useRouteContext();
  const [selection, setSelection] = useState<OrderSelection | null>(null);
  const select = (product: Product) => setSelection({ productId: product.id, productName: product.name, priceCents: product.priceCents });
  return <><p>Simple catalog and layered orders are independently owned modules. This route composes them.</p><ProductCatalog onSelect={select} /><OrderCheckout service={orders} selection={selection} /></>;
}
export const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DemoPage });
