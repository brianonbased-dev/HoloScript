/**
 * FileSystemTrait — v5.1
 * Local/remote file system operations.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { extractPayload } from './TraitTypes';

export interface FileSystemConfig {
  root: string;
}

function normalizeFsPath(root: string, inputPath: string): string {
  const normalizedRoot = (root || '/').replace(/\\/g, '/').replace(/\/$/, '') || '/';
  const rawPath = (inputPath || '').replace(/\\/g, '/');
  const relativePath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
  const combined = (
    normalizedRoot === '/' ? `/${relativePath}` : `${normalizedRoot}/${relativePath}`
  ).replace(/\/+/g, '/');

  const segments = combined.split('/');
  const stack: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(segment);
  }

  const resolved = `/${stack.join('/')}`;
  const rootPrefix = normalizedRoot === '/' ? '/' : `${normalizedRoot}/`;
  if (!(resolved === normalizedRoot || resolved.startsWith(rootPrefix))) {
    throw new Error(`Path escapes file_system root: ${inputPath}`);
  }

  return resolved;
}

export const fileSystemHandler: TraitHandler<FileSystemConfig> = {
  name: 'file_system',
  defaultConfig: { root: '/' },
  onAttach(node: HSPlusNode): void {
    node.__fsState = { files: new Map<string, string>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__fsState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: FileSystemConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__fsState as { files: Map<string, string> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    const payload = extractPayload(event);
    const fsCaps = context.hostCapabilities?.fileSystem;

    switch (t) {
      case 'fs:write': {
        try {
          const path = normalizeFsPath(_config.root, payload.path as string);
          const content = (payload.content as string) ?? '';

          if (fsCaps) {
            Promise.resolve(fsCaps.writeFile(path, content))
              .then(() => context.emit?.('fs:written', { path }))
              .catch((err: unknown) =>
                // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
                context.emit?.('fs:error', { path, error: err?.message ?? String(err) })
              );
            break;
          }

          state.files.set(path, content);
          context.emit?.('fs:written', { path });
        } catch (err: unknown) {
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          context.emit?.('fs:error', { path: payload.path, error: err?.message ?? String(err) });
        }
        break;
      }

      case 'fs:read': {
        try {
          const path = normalizeFsPath(_config.root, payload.path as string);

          if (fsCaps) {
            Promise.resolve(fsCaps.readFile(path))
              .then((content: string) =>
                context.emit?.('fs:read_result', { path, content, exists: true })
              )
              .catch(async () => {
                const exists = fsCaps.exists ? await Promise.resolve(fsCaps.exists(path)) : false;
                context.emit?.('fs:read_result', { path, content: undefined, exists });
              });
            break;
          }

          const content = state.files.get(path);
          context.emit?.('fs:read_result', { path, content, exists: content !== undefined });
        } catch (err: unknown) {
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          context.emit?.('fs:error', { path: payload.path, error: err?.message ?? String(err) });
        }
        break;
      }

      case 'fs:delete': {
        try {
          const path = normalizeFsPath(_config.root, payload.path as string);

          if (fsCaps) {
            Promise.resolve(fsCaps.deleteFile(path))
              .then(() => context.emit?.('fs:deleted', { path }))
              .catch((err: unknown) =>
                // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
                context.emit?.('fs:error', { path, error: err?.message ?? String(err) })
              );
            break;
          }

          state.files.delete(path);
          context.emit?.('fs:deleted', { path });
        } catch (err: unknown) {
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          context.emit?.('fs:error', { path: payload.path, error: err?.message ?? String(err) });
        }
        break;
      }
    }
  },
};
export default fileSystemHandler;
