import { describe, expect, it, vi } from 'vitest';

import { isStrictNativeInstall, runNativeInstall } from '../scripts/install-native-optional.mjs';

describe('install-native-optional', () => {
  it('passes through a successful native rebuild', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const warn = vi.fn();

    expect(
      runNativeInstall({
        env: { npm_config_node_gyp: '/mock/node-gyp.js' },
        cwd: '/repo/packages/tree-sitter-holoscript',
        spawn,
        warn,
      })
    ).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/mock/node-gyp.js', 'rebuild'],
      expect.objectContaining({ cwd: '/repo/packages/tree-sitter-holoscript' })
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps normal install nonfatal when native rebuild fails', () => {
    const spawn = vi.fn(() => ({ status: 7 }));
    const warn = vi.fn();

    expect(
      runNativeInstall({
        env: { npm_config_node_gyp: '/mock/node-gyp.js' },
        spawn,
        warn,
      })
    ).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('optional native binding build failed')
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('build:native'));
  });

  it('fails in strict native mode', () => {
    const spawn = vi.fn(() => ({ status: 7 }));

    expect(
      runNativeInstall({
        env: {
          npm_config_node_gyp: '/mock/node-gyp.js',
          TREE_SITTER_HOLOSCRIPT_STRICT_NATIVE: '1',
        },
        spawn,
        warn: vi.fn(),
      })
    ).toBe(7);
    expect(isStrictNativeInstall({ TREE_SITTER_HOLOSCRIPT_STRICT_NATIVE: '1' })).toBe(true);
  });
});
