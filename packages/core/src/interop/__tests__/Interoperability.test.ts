import { describe, it, expect, vi } from 'vitest';
import {
  ExportImportHandler,
  AsyncFunctionHandler,
  ErrorBoundary,
  TypeScriptTypeLoader,
  InteropContext,
} from '../Interoperability';

// ============================================================
// ExportImportHandler
// ============================================================
describe('ExportImportHandler', () => {
  it('defineExport and getExport roundtrip', () => {
    const h = new ExportImportHandler();
    h.defineExport('mod', 'greet', () => 'hi');
    expect(h.getExport('mod', 'greet')()).toBe('hi');
  });

  it('getExport throws for missing module', () => {
    const h = new ExportImportHandler();
    expect(() => h.getExport('no-such', 'x')).toThrow('Module not found');
  });

  it('getExport throws for missing export name', () => {
    const h = new ExportImportHandler();
    h.defineExport('mod', 'a', 1);
    expect(() => h.getExport('mod', 'b')).toThrow("Named export 'b'");
  });

  it('getAllExports returns object', () => {
    const h = new ExportImportHandler();
    h.defineExport('mod', 'a', 1);
    h.defineExport('mod', 'b', 2);
    expect(h.getAllExports('mod')).toEqual({ a: 1, b: 2 });
  });

  it('getAllExports returns {} for unknown module', () => {
    expect(new ExportImportHandler().getAllExports('x')).toEqual({});
  });

  it('hasExport', () => {
    const h = new ExportImportHandler();
    h.defineExport('mod', 'x', 1);
    expect(h.hasExport('mod', 'x')).toBe(true);
    expect(h.hasExport('mod', 'y')).toBe(false);
    expect(h.hasExport('no', 'x')).toBe(false);
  });
});

// ============================================================
// AsyncFunctionHandler
// ============================================================
describe('AsyncFunctionHandler', () => {
  const handler = new AsyncFunctionHandler();

  it('wrapAsyncFunction passes through success', async () => {
    const fn = handler.wrapAsyncFunction(async (x: number) => x * 2);
    await expect(fn(5)).resolves.toBe(10);
  });

  it('wrapAsyncFunction normalizes thrown string', async () => {
    const fn = handler.wrapAsyncFunction(async () => {
      throw 'oops';
    });
    await expect(fn()).rejects.toThrow('oops');
  });

  it('isAsync detects async functions', () => {
    expect(handler.isAsync(async () => {})).toBe(true);
    expect(handler.isAsync(() => {})).toBe(false);
    expect(handler.isAsync(42)).toBe(false);
  });

  it('callbackToPromise resolves', async () => {
    const result = await handler.callbackToPromise((cb) => cb(null, 'done'));
    expect(result).toBe('done');
  });

  it('callbackToPromise rejects on error', async () => {
    await expect(handler.callbackToPromise((cb) => cb(new Error('fail'), null))).rejects.toThrow(
      'fail'
    );
  });
});

// ============================================================
// ErrorBoundary
// ============================================================
describe('ErrorBoundary', () => {
  it('wrap catches sync errors', () => {
    const onErr = vi.fn();
    const eb = new ErrorBoundary(onErr);
    const fn = eb.wrap(() => {
      throw new Error('boom');
    });
    expect(() => fn()).toThrow('boom');
    expect(onErr).toHaveBeenCalledTimes(1);
    expect(eb.getErrors().length).toBe(1);
  });

  it('wrap catches async errors', async () => {
    const eb = new ErrorBoundary();
    const fn = eb.wrap(async () => {
      throw new Error('async boom');
    });
    await expect(fn()).rejects.toThrow('async boom');
    expect(eb.getErrors().length).toBe(1);
  });

  it('wrapAsync catches errors', async () => {
    const eb = new ErrorBoundary();
    const fn = eb.wrapAsync(async () => {
      throw 'str error';
    });
    await expect(fn()).rejects.toThrow('str error');
    expect(eb.getErrors()[0].message).toBe('str error');
  });

  it('execute catches sync', () => {
    const eb = new ErrorBoundary();
    expect(() =>
      eb.execute(() => {
        throw { msg: 'obj' };
      })
    ).toThrow();
    expect(eb.getErrors()[0].message).toContain('msg');
  });

  it('executeAsync catches async', async () => {
    const eb = new ErrorBoundary();
    await expect(
      eb.executeAsync(async () => {
        throw new Error('fail');
      })
    ).rejects.toThrow('fail');
    expect(eb.getErrors().length).toBe(1);
  });

  it('clearErrors resets', () => {
    const eb = new ErrorBoundary();
    try {
      eb.execute(() => {
        throw new Error('x');
      });
    } catch {}
    eb.clearErrors();
    expect(eb.getErrors().length).toBe(0);
  });
});

// ============================================================
// TypeScriptTypeLoader
// ============================================================
describe('TypeScriptTypeLoader', () => {
  const loader = new TypeScriptTypeLoader();

  it('converts string primitives', () => {
    expect(loader.convertType('string')).toBe('text');
    expect(loader.convertType('number')).toBe('numeric');
    expect(loader.convertType('boolean')).toBe('logical');
    expect(loader.convertType('any')).toBe('dynamic');
  });

  it('passes unknown types through', () => {
    expect(loader.convertType('CustomType')).toBe('CustomType');
  });

  it('converts array type', () => {
    const result = loader.convertType(['string']);
    expect(result).toEqual({ kind: 'array', elementType: 'text' });
  });

  it('converts object type', () => {
    const result = loader.convertType({ x: 'number', y: 'boolean' });
    expect(result).toEqual({
      kind: 'object',
      properties: { x: 'numeric', y: 'logical' },
    });
  });

  it('loadTypes returns a Map', () => {
    const m = loader.loadTypes('test.d.ts');
    expect(m).toBeInstanceOf(Map);
  });
});

// ============================================================
// InteropContext
// ============================================================
describe('InteropContext', () => {
  it('exposes all sub-systems', () => {
    const ctx = new InteropContext();
    expect(ctx.getModuleResolver()).toBeDefined();
    expect(ctx.getExportImportHandler()).toBeDefined();
    expect(ctx.getAsyncHandler()).toBeDefined();
    expect(ctx.getErrorBoundary()).toBeDefined();
    expect(ctx.getTypeLoader()).toBeDefined();
  });
});
