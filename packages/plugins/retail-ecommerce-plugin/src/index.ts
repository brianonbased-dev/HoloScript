export { createCartHandler, type CartConfig, type CartItem, type CartState } from './traits/CartTrait';
export { createCheckoutHandler, type CheckoutConfig, type CheckoutStep, type PaymentMethod, type Address } from './traits/CheckoutTrait';
export { createProductCatalogHandler, type ProductCatalogConfig, type Product } from './traits/ProductCatalogTrait';
export { createShippingRateHandler, type ShippingRateConfig, type ShippingMethod } from './traits/ShippingRateTrait';
export { createReturnHandler, type ReturnConfig, type ReturnStatus } from './traits/ReturnTrait';
export * from './traits/types';

import { createCartHandler } from './traits/CartTrait';
import { createCheckoutHandler } from './traits/CheckoutTrait';
import { createProductCatalogHandler } from './traits/ProductCatalogTrait';
import { createShippingRateHandler } from './traits/ShippingRateTrait';
import { createReturnHandler } from './traits/ReturnTrait';

export const pluginMeta = { name: '@holoscript/plugin-retail-ecommerce', version: '1.0.0', traits: ['cart', 'checkout', 'product_catalog', 'shipping_rate', 'return'] };
export const traitHandlers = [createCartHandler(), createCheckoutHandler(), createProductCatalogHandler(), createShippingRateHandler(), createReturnHandler()];
