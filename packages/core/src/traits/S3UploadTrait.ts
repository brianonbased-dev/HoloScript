/**
 * S3UploadTrait — v5.1
 * S3-compatible object storage upload.
 *
 * WIRING SPEC (2026-05-25 deep-ratchet):
 * Current implementation echoes s3:uploaded with no actual upload.
 * Real wiring requires:
 *   1. AWS SDK (`@aws-sdk/client-s3`) or a generic S3-compatible client (MinIO, R2)
 *   2. Configurable credentials (access_key_id, secret_access_key, endpoint, region)
 *   3. Presigned-URL generation OR direct PutObject for smaller files
 *   4. Multipart upload for files > max_size_mb
 *   5. Emit s3:uploaded with ETag and location on success
 *   6. Emit s3:error on credential/network/failure
 * RISK: Credential rotation + endpoint configurability must be design-reviewed.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface S3UploadConfig {
  bucket: string;
  max_size_mb: number;
}
export const s3UploadHandler: TraitHandler<S3UploadConfig> = {
  name: 's3_upload',
  defaultConfig: { bucket: 'default', max_size_mb: 100 },
  onAttach(node: HSPlusNode): void {
    node.__s3State = { uploads: 0, totalBytes: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__s3State;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: S3UploadConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__s3State as { uploads: number; totalBytes: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 's3:upload') {
      state.uploads++;
      state.totalBytes += (event.size as number) ?? 0;
      context.emit?.('s3:uploaded', {
        key: event.key,
        bucket: (event.bucket as string) ?? config.bucket,
        uploads: state.uploads,
      });
    }
  },
};
export default s3UploadHandler;
