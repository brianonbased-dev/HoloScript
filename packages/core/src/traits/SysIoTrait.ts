/**
 * SysIoTrait — v5.1
 * System I/O operations.
 */
import type { TraitHandler } from './TraitTypes';
export interface SysIoConfig { allow_write: boolean; }
export const sysIoHandler: TraitHandler<SysIoConfig> = {
  name: 'sys_io' as any, defaultConfig: { allow_write: false },
  onAttach(node: any): void { node.__sysState = { reads: 0, writes: 0 }; },
  onDetach(node: any): void { delete node.__sysState; },
  onUpdate(): void {},
  onEvent(node: any, config: SysIoConfig, context: any, event: any): void {
    const state = node.__sysState as { reads: number; writes: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'sysio:read': state.reads++; context.emit?.('sysio:data', { path: event.path, readCount: state.reads }); break;
      case 'sysio:write': if (config.allow_write) { state.writes++; context.emit?.('sysio:written', { path: event.path, writeCount: state.writes }); } else { context.emit?.('sysio:denied', { path: event.path, reason: 'write_disabled' }); } break;
    }
  },
};
export default sysIoHandler;
