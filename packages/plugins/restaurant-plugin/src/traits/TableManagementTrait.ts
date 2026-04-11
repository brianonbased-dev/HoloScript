/** @table_management Trait — Restaurant table/seating management. @trait table_management */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type TableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning' | 'blocked';
export interface Table { id: string; seats: number; section: string; status: TableStatus; partySize?: number; seatedAt?: number; }
export interface TableManagementConfig { tables: Table[]; turnoverTargetMin: number; waitlistEnabled: boolean; }
export interface TableManagementState { availableCount: number; occupiedCount: number; waitlistSize: number; avgTurnoverMin: number; }

const defaultConfig: TableManagementConfig = { tables: [], turnoverTargetMin: 60, waitlistEnabled: true };

export function createTableManagementHandler(): TraitHandler<TableManagementConfig> {
  return { name: 'table_management', defaultConfig,
    onAttach(n: HSPlusNode, c: TableManagementConfig, ctx: TraitContext) {
      const avail = c.tables.filter(t => t.status === 'available').length;
      n.__tableState = { availableCount: avail, occupiedCount: c.tables.length - avail, waitlistSize: 0, avgTurnoverMin: 0 };
      ctx.emit?.('tables:initialized', { total: c.tables.length, available: avail });
    },
    onDetach(n: HSPlusNode, _c: TableManagementConfig, ctx: TraitContext) { delete n.__tableState; ctx.emit?.('tables:closed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: TableManagementConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__tableState as TableManagementState | undefined; if (!s) return;
      if (e.type === 'tables:seat') {
        const tableId = e.payload?.tableId as string; const party = (e.payload?.partySize as number) ?? 1;
        const table = c.tables.find(t => t.id === tableId);
        if (table && table.status === 'available') { table.status = 'occupied'; table.partySize = party; table.seatedAt = Date.now(); s.availableCount--; s.occupiedCount++; ctx.emit?.('tables:seated', { table: tableId, party }); }
      }
      if (e.type === 'tables:clear') {
        const tableId = e.payload?.tableId as string;
        const table = c.tables.find(t => t.id === tableId);
        if (table && table.status === 'occupied') { table.status = 'available'; s.availableCount++; s.occupiedCount--; ctx.emit?.('tables:cleared', { table: tableId }); }
      }
      if (e.type === 'tables:add_waitlist') { s.waitlistSize++; ctx.emit?.('tables:waitlist_updated', { size: s.waitlistSize }); }
    },
  };
}
