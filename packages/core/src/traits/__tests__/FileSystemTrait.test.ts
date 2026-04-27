/**
 * FileSystemTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { fileSystemHandler } from '../FileSystemTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __fsState: undefined as unknown,
});

const defaultConfig = { root: '/sandbox' };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('FileSystemTrait — metadata', () => {
  it('has name "file_system"', () => {
    expect(fileSystemHandler.name).toBe('file_system');
  });

  it('defaultConfig root is "/"', () => {
    expect(fileSystemHandler.defaultConfig?.root).toBe('/');
  });
});

describe('FileSystemTrait — lifecycle', () => {
  it('onAttach initializes empty files map', () => {
    const node = makeNode();
    fileSystemHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__fsState as { files: Map<string, string> };
    expect(state.files).toBeInstanceOf(Map);
    expect(state.files.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    fileSystemHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fileSystemHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__fsState).toBeUndefined();
  });
});

describe('FileSystemTrait — onEvent', () => {
  it('fs:write stores file and emits fs:written', () => {
    const node = makeNode();
    fileSystemHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fileSystemHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fs:write', path: 'notes.txt', content: 'Hello World',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('fs:written', { path: '/sandbox/notes.txt' });
    const state = node.__fsState as { files: Map<string, string> };
    expect(state.files.get('/sandbox/notes.txt')).toBe('Hello World');
  });

  it('fs:read returns content and exists=true for existing file', () => {
    const node = makeNode();
    fileSystemHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fileSystemHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fs:write', path: 'data.txt', content: 'test content',
    } as never);
    node.emit.mockClear();
    fileSystemHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fs:read', path: 'data.txt',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('fs:read_result', {
      path: '/sandbox/data.txt', content: 'test content', exists: true,
    });
  });

  it('fs:read returns exists=false for missing file', () => {
    const node = makeNode();
    fileSystemHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fileSystemHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fs:read', path: 'missing.txt',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('fs:read_result', {
      path: '/sandbox/missing.txt', content: undefined, exists: false,
    });
  });

  it('fs:delete removes file and emits fs:deleted', () => {
    const node = makeNode();
    fileSystemHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fileSystemHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fs:write', path: 'temp.txt', content: 'data',
    } as never);
    node.emit.mockClear();
    fileSystemHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fs:delete', path: 'temp.txt',
    } as never);
    const state = node.__fsState as { files: Map<string, string> };
    expect(state.files.has('/sandbox/temp.txt')).toBe(false);
    expect(node.emit).toHaveBeenCalledWith('fs:deleted', { path: '/sandbox/temp.txt' });
  });

  it('fs:write emits fs:error for path traversal attempt', () => {
    const node = makeNode();
    fileSystemHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fileSystemHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fs:write', path: '../../etc/passwd', content: 'evil',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('fs:error', expect.objectContaining({
      error: expect.stringContaining('escapes'),
    }));
  });
});
