export { createMenuHandler, type MenuConfig, type MenuItem } from './traits/MenuTrait';
export { createOrderHandler, type OrderConfig, type OrderItem, type OrderStatus } from './traits/OrderTrait';
export { createKitchenDisplayHandler, type KitchenDisplayConfig, type KitchenTicket } from './traits/KitchenDisplayTrait';
export { createTableManagementHandler, type TableManagementConfig, type Table, type TableStatus } from './traits/TableManagementTrait';
export * from './traits/types';

import { createMenuHandler } from './traits/MenuTrait';
import { createOrderHandler } from './traits/OrderTrait';
import { createKitchenDisplayHandler } from './traits/KitchenDisplayTrait';
import { createTableManagementHandler } from './traits/TableManagementTrait';

export const pluginMeta = { name: '@holoscript/plugin-restaurant', version: '1.0.0', traits: ['menu', 'order', 'kitchen_display', 'table_management'] };
export const traitHandlers = [createMenuHandler(), createOrderHandler(), createKitchenDisplayHandler(), createTableManagementHandler()];
