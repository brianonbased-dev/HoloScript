/**
 * S3UploadTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { s3UploadHandler } from '../S3UploadTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __s3State: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { bucket: 'default', max_size_mb: 100 };

describe('S3UploadTrait', () => {
  it('has name "s3_upload"', () => {
    expect(s3UploadHandler.name).toBe('s3_upload');
  });

  it('s3:upload increments uploads and emits s3:uploaded', () => {
    const node = makeNode();
    s3UploadHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    s3UploadHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 's3:upload', key: 'file.png', size: 1024,
    } as never);
    expect((node.__s3State as { uploads: number }).uploads).toBe(1);
    expect(node.emit).toHaveBeenCalledWith('s3:uploaded', expect.objectContaining({ key: 'file.png', bucket: 'default' }));
  });
});
