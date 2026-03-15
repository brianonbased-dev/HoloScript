/**
 * FileSystemTrait — v5.1
 * Local/remote file system operations.
 */
import type { TraitHandler } from './TraitTypes';
export interface FileSystemConfig { root: string; }
export const fileSystemHandler: TraitHandler<FileSystemConfig> = {
  name: 'file_system', defaultConfig: { root: '/' },
  onAttach(node: any): void { node.__fsState = { files: new Map<string, string>() }; },
  onDetach(node: any): void { delete node.__fsState; },
  onUpdate(): void {},
  onEvent(node: any, _config: FileSystemConfig, context: any, event: any): void {
    const state = node.__fsState as { files: Map<string, string> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'fs:write': state.files.set(event.path as string, (event.content as string) ?? ''); context.emit?.('fs:written', { path: event.path }); break;
      case 'fs:read': { const content = state.files.get(event.path as string); context.emit?.('fs:read_result', { path: event.path, content, exists: content !== undefined }); break; }
      case 'fs:delete': state.files.delete(event.path as string); context.emit?.('fs:deleted', { path: event.path }); break;
    }
  },
};
export default fileSystemHandler;
