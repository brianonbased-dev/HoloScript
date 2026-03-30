/**
 * S3UploadTrait — v5.1
 * S3-compatible object storage upload.
 */
import type { TraitHandler } from './TraitTypes';
export interface S3UploadConfig {
  bucket: string;
  max_size_mb: number;
}
export const s3UploadHandler: TraitHandler<S3UploadConfig> = {
  name: 's3_upload',
  defaultConfig: { bucket: 'default', max_size_mb: 100 },
  onAttach(node: any): void {
    node.__s3State = { uploads: 0, totalBytes: 0 };
  },
  onDetach(node: any): void {
    delete node.__s3State;
  },
  onUpdate(): void {},
  onEvent(node: any, config: S3UploadConfig, context: any, event: any): void {
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
