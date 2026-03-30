/**
 * BlobStoreTrait — v5.1
 * Binary large object storage.
 */
import type { TraitHandler } from './TraitTypes';
export interface BlobStoreConfig {
  max_blob_mb: number;
}
export const blobStoreHandler: TraitHandler<BlobStoreConfig> = {
  name: 'blob_store',
  defaultConfig: { max_blob_mb: 500 },
  onAttach(node: any): void {
    node.__blobState = { blobs: new Map<string, number>() };
  },
  onDetach(node: any): void {
    delete node.__blobState;
  },
  onUpdate(): void {},
  onEvent(node: any, _config: BlobStoreConfig, context: any, event: any): void {
    const state = node.__blobState as { blobs: Map<string, number> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'blob:put':
        state.blobs.set(event.blobId as string, (event.size as number) ?? 0);
        context.emit?.('blob:stored', { blobId: event.blobId, total: state.blobs.size });
        break;
      case 'blob:get':
        context.emit?.('blob:retrieved', {
          blobId: event.blobId,
          exists: state.blobs.has(event.blobId as string),
        });
        break;
    }
  },
};
export default blobStoreHandler;
