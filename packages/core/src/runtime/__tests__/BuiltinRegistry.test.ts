import { describe, it, expect, beforeEach } from 'vitest';
import { BuiltinRegistry, parseRuntimeDeclaration } from '../BuiltinRegistry';

describe('BuiltinRegistry', () => {
  // Note: BuiltinRegistry is a singleton with private constructor.
  // We test via getInstance() and register custom implementations.

  let registry: BuiltinRegistry;

  beforeEach(() => {
    registry = BuiltinRegistry.getInstance();
  });

  it('getInstance returns singleton', () => {
    const r1 = BuiltinRegistry.getInstance();
    const r2 = BuiltinRegistry.getInstance();
    expect(r1).toBe(r2);
  });

  it('has default builtins registered', () => {
    expect(registry.has('SpeechRecognizer')).toBe(true);
    expect(registry.has('TextToSpeech')).toBe(true);
    expect(registry.has('GPUContext')).toBe(true);
    expect(registry.has('FlowFieldGenerator')).toBe(true);
    expect(registry.has('FrustrationEstimator')).toBe(true);
  });

  it('has is case insensitive', () => {
    expect(registry.has('speechrecognizer')).toBe(true);
    expect(registry.has('GPUCONTEXT')).toBe(true);
  });

  it('register adds custom builtin', () => {
    registry.register('TestModule', {
      create: (config) => ({ type: 'test', ...config }),
      description: 'Test module',
      backends: ['mock'],
    });
    expect(registry.has('TestModule')).toBe(true);
  });

  it('create instantiates a custom builtin', () => {
    registry.register('SimpleModule', {
      create: (config) => ({ created: true, backend: config.backend }),
    });
    const instance = registry.create({ name: 'SimpleModule', backend: 'mock', config: {} }) as any;
    expect(instance.created).toBe(true);
    expect(instance.backend).toBe('mock');
  });

  it('create throws for unknown builtin', () => {
    expect(() => registry.create({ name: 'NonExistent', backend: 'any', config: {} })).toThrow('Unknown builtin');
  });

  it('list returns all registered builtins', () => {
    const all = registry.list();
    expect(all.length).toBeGreaterThanOrEqual(5);
    const names = all.map(b => b.name);
    expect(names).toContain('speechrecognizer');
  });

  it('cleanup calls destroy on instances', () => {
    let destroyed = false;
    registry.register('destroyable', {
      create: () => ({ alive: true }),
      destroy: () => { destroyed = true; },
    });
    registry.create({ name: 'destroyable', backend: 'test', config: {} });
    registry.cleanup();
    expect(destroyed).toBe(true);
  });
});

describe('parseRuntimeDeclaration', () => {
  it('parses valid builtin declaration', () => {
    const decl = parseRuntimeDeclaration(
      'MyModule',
      [{ type: 'builtin', value: '' }],
      { backend: 'gpu' }
    );
    expect(decl.name).toBe('MyModule');
    expect(decl.backend).toBe('gpu');
  });

  it('defaults backend to auto', () => {
    const decl = parseRuntimeDeclaration(
      'MyModule',
      [{ type: 'builtin', value: '' }],
      {}
    );
    expect(decl.backend).toBe('auto');
  });

  it('throws when @builtin directive is missing', () => {
    expect(() => parseRuntimeDeclaration('MyModule', [], {})).toThrow('missing @builtin');
  });
});
