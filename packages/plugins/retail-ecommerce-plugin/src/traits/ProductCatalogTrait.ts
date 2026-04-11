/** @product_catalog Trait — Product catalog with search and filtering. @trait product_catalog */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface Product { id: string; name: string; price: number; category: string; brand?: string; inStock: boolean; imageUrl?: string; }
export interface ProductCatalogConfig { products: Product[]; categories: string[]; sortBy: 'price_asc' | 'price_desc' | 'name' | 'newest'; pageSize: number; }

const defaultConfig: ProductCatalogConfig = { products: [], categories: [], sortBy: 'name', pageSize: 20 };

export function createProductCatalogHandler(): TraitHandler<ProductCatalogConfig> {
  return {
    name: 'product_catalog', defaultConfig,
    onAttach(node: HSPlusNode, config: ProductCatalogConfig, ctx: TraitContext) { node.__catalogState = { currentPage: 0, filteredCount: config.products.length, activeFilters: {} }; ctx.emit?.('catalog:loaded', { productCount: config.products.length }); },
    onDetach(node: HSPlusNode, _c: ProductCatalogConfig, ctx: TraitContext) { delete node.__catalogState; ctx.emit?.('catalog:unloaded'); },
    onUpdate() {},
    onEvent(node: HSPlusNode, config: ProductCatalogConfig, ctx: TraitContext, event: TraitEvent) {
      if (event.type === 'catalog:search') {
        const query = (event.payload?.query as string || '').toLowerCase();
        const results = config.products.filter(p => p.name.toLowerCase().includes(query));
        ctx.emit?.('catalog:results', { count: results.length, products: results.slice(0, config.pageSize) });
      }
      if (event.type === 'catalog:filter') {
        const category = event.payload?.category as string;
        const results = category ? config.products.filter(p => p.category === category) : config.products;
        ctx.emit?.('catalog:filtered', { count: results.length, category });
      }
    },
  };
}
