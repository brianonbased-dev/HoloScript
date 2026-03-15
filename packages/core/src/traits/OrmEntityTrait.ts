/**
 * OrmEntityTrait — v5.1
 * ORM entity mapping and CRUD.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface OrmEntityConfig { table_prefix: string; }
export const ormEntityHandler: TraitHandler<OrmEntityConfig> = {
  name: 'orm_entity', defaultConfig: { table_prefix: '' },
  onAttach(node: HSPlusNode): void { node.__ormState = { entities: new Map<string, Record<string, unknown>>() }; },
  onDetach(node: HSPlusNode): void { delete node.__ormState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: OrmEntityConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__ormState as { entities: Map<string, Record<string, unknown>> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'orm:create': state.entities.set(event.entityId as string, (event.data as Record<string, unknown>) ?? {}); context.emit?.('orm:created', { entityId: event.entityId, total: state.entities.size }); break;
      case 'orm:read': context.emit?.('orm:found', { entityId: event.entityId, data: state.entities.get(event.entityId as string), exists: state.entities.has(event.entityId as string) }); break;
      case 'orm:update': { const e = state.entities.get(event.entityId as string); if (e) { Object.assign(e, (event.data as Record<string, unknown>) ?? {}); context.emit?.('orm:updated', { entityId: event.entityId }); } break; }
      case 'orm:delete': state.entities.delete(event.entityId as string); context.emit?.('orm:deleted', { entityId: event.entityId }); break;
    }
  },
};
export default ormEntityHandler;
