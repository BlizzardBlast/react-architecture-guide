import { rootRoute } from './root';
import { homeRoute } from './home';
import { aboutRoute } from './about';
export const routeTree = rootRoute.addChildren([homeRoute, aboutRoute]);
