/**
 * ConfigMergeAndLoader Tests
 *
 * Tests for mergeConfigs (deep merge utility) and ConfigLoader
 * (file-based config loading with extends inheritance).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { mergeConfigs } from '../config/merge';
import { ConfigLoader } from '../config/loader';
import type { HoloScriptConfig } from '../config/schema';

// =============================================================================
// mergeConfigs
// =============================================================================

describe('mergeConfigs', () => {
  it('returns base when extension is empty', () => {
    const base: HoloScriptConfig = { project: { name: 'base' } };
    const result = mergeConfigs(base, {});
    expect(result.project?.name).toBe('base');
  });

  it('extension overwrites top-level scalar', () => {
    const base: HoloScriptConfig = { project: { name: 'base', version: '1.0.0' } };
    const ext: Partial<HoloScriptConfig> = { project: { name: 'ext' } };
    const result = mergeConfigs(base, ext);
    expect(result.project?.name).toBe('ext');
  });

  it('deep-merges nested objects', () => {
    const base: HoloScriptConfig = {
      compilerOptions: { target: 'threejs', strict: true },
    };
    const ext: Partial<HoloScriptConfig> = {
      compilerOptions: { outputDir: 'dist' },
    };
    const result = mergeConfigs(base, ext);
    expect(result.compilerOptions?.target).toBe('threejs');
    expect(result.compilerOptions?.strict).toBe(true);
    expect(result.compilerOptions?.outputDir).toBe('dist');
  });

  it('extension value overwrites nested scalar', () => {
    const base: HoloScriptConfig = {
      compilerOptions: { target: 'threejs', strict: false },
    };
    const ext: Partial<HoloScriptConfig> = {
      compilerOptions: { strict: true },
    };
    const result = mergeConfigs(base, ext);
    expect(result.compilerOptions?.strict).toBe(true);
  });

  it('arrays are replaced, not merged', () => {
    const base = { extends: ['a.json', 'b.json'] };
    const ext = { extends: ['c.json'] };
    const result = mergeConfigs(base, ext);
    expect(result.extends).toEqual(['c.json']);
  });

  it('undefined extension values do not overwrite base', () => {
    const base: HoloScriptConfig = { project: { name: 'keep' } };
    const ext: Partial<HoloScriptConfig> = { project: undefined };
    const result = mergeConfigs(base, ext);
    expect(result.project?.name).toBe('keep');
  });

  it('null extension value overwrites base (null is not undefined)', () => {
    const base = { project: { name: 'base' }, extra: 'hello' };
    const ext = { extra: null };
    const result = mergeConfigs(base, ext as never);
    expect(result.extra).toBeNull();
  });

  it('does not mutate the base object', () => {
    const base: HoloScriptConfig = { project: { name: 'original' } };
    mergeConfigs(base, { project: { name: 'changed' } });
    expect(base.project?.name).toBe('original');
  });

  it('multiple compilerOptions fields merge correctly', () => {
    const base: HoloScriptConfig = {
      compilerOptions: { target: 'unity', outputDir: 'out', strict: false },
    };
    const ext: Partial<HoloScriptConfig> = {
      compilerOptions: { strict: true, baseUrl: '.' },
    };
    const result = mergeConfigs(base, ext);
    expect(result.compilerOptions?.target).toBe('unity');
    expect(result.compilerOptions?.outputDir).toBe('out');
    expect(result.compilerOptions?.strict).toBe(true);
    expect(result.compilerOptions?.baseUrl).toBe('.');
  });

  it('merges formatOptions', () => {
    const base: HoloScriptConfig = { formatOptions: { indentSize: 2, useTabs: false } };
    const ext: Partial<HoloScriptConfig> = { formatOptions: { useTabs: true } };
    const result = mergeConfigs(base, ext);
    expect(result.formatOptions?.indentSize).toBe(2);
    expect(result.formatOptions?.useTabs).toBe(true);
  });

  it('merges lintOptions', () => {
    const base: HoloScriptConfig = { lintOptions: { noUnusedVariables: true } };
    const ext: Partial<HoloScriptConfig> = { lintOptions: { requireAltText: true } };
    const result = mergeConfigs(base, ext);
    expect(result.lintOptions?.noUnusedVariables).toBe(true);
    expect(result.lintOptions?.requireAltText).toBe(true);
  });

  it('empty base with populated extension produces correct result', () => {
    const base: HoloScriptConfig = {};
    const ext: Partial<HoloScriptConfig> = { project: { name: 'new-project' } };
    const result = mergeConfigs(base, ext);
    expect(result.project?.name).toBe('new-project');
  });
});

// =============================================================================
// ConfigLoader
// =============================================================================

describe('ConfigLoader', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-cfg-test-'));

  function writeConfig(name: string, content: HoloScriptConfig): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, JSON.stringify(content), 'utf-8');
    return filePath;
  }

  afterEach(() => {
    // Clean up any files written during tests
    for (const f of fs.readdirSync(tmpDir)) {
      fs.unlinkSync(path.join(tmpDir, f));
    }
  });

  it('loads a simple config file', async () => {
    const configPath = writeConfig('simple.json', { project: { name: 'hello' } });
    const loader = new ConfigLoader();
    const config = await loader.loadConfig(configPath);
    expect(config.project?.name).toBe('hello');
  });

  it('throws for a missing config file', async () => {
    const loader = new ConfigLoader();
    await expect(loader.loadConfig('/no/such/file.json')).rejects.toThrow(/not found/i);
  });

  it('throws for invalid JSON', async () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, 'not json { {{ ', 'utf-8');
    const loader = new ConfigLoader();
    await expect(loader.loadConfig(filePath)).rejects.toThrow(/Failed to parse/i);
  });

  it('resolves a single local extends', async () => {
    writeConfig('base.json', { compilerOptions: { target: 'threejs', strict: true } });
    const childPath = writeConfig('child.json', {
      extends: './base.json',
      project: { name: 'child' },
    });
    const loader = new ConfigLoader();
    const config = await loader.loadConfig(childPath);
    expect(config.project?.name).toBe('child');
    expect(config.compilerOptions?.target).toBe('threejs');
    expect(config.compilerOptions?.strict).toBe(true);
  });

  it('child values override base values', async () => {
    writeConfig('base2.json', {
      compilerOptions: { target: 'unity', strict: false },
    });
    const childPath = writeConfig('child2.json', {
      extends: './base2.json',
      compilerOptions: { strict: true },
    });
    const loader = new ConfigLoader();
    const config = await loader.loadConfig(childPath);
    expect(config.compilerOptions?.strict).toBe(true);
    expect(config.compilerOptions?.target).toBe('unity');
  });

  it('resolves array extends (multiple bases)', async () => {
    writeConfig('baseA.json', { formatOptions: { indentSize: 4 } });
    writeConfig('baseB.json', { lintOptions: { requireAltText: true } });
    const childPath = writeConfig('childMulti.json', {
      extends: ['./baseA.json', './baseB.json'],
      project: { name: 'multi' },
    });
    const loader = new ConfigLoader();
    const config = await loader.loadConfig(childPath);
    expect(config.formatOptions?.indentSize).toBe(4);
    expect(config.lintOptions?.requireAltText).toBe(true);
    expect(config.project?.name).toBe('multi');
  });

  it('detects circular config inheritance', async () => {
    const aPath = path.join(tmpDir, 'circular-a.json');
    const bPath = path.join(tmpDir, 'circular-b.json');
    fs.writeFileSync(aPath, JSON.stringify({ extends: './circular-b.json' }), 'utf-8');
    fs.writeFileSync(bPath, JSON.stringify({ extends: './circular-a.json' }), 'utf-8');
    const loader = new ConfigLoader();
    await expect(loader.loadConfig(aPath)).rejects.toThrow(/Circular dependency/i);
  });

  it('findAndLoad returns null when no config file exists', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-empty-'));
    try {
      const config = await ConfigLoader.findAndLoad(emptyDir);
      expect(config).toBeNull();
    } finally {
      fs.rmdirSync(emptyDir);
    }
  });

  it('findAndLoad loads holoscript.config.json from cwd', async () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-cwd-'));
    try {
      fs.writeFileSync(
        path.join(configDir, 'holoscript.config.json'),
        JSON.stringify({ project: { name: 'found-it' } }),
        'utf-8'
      );
      const config = await ConfigLoader.findAndLoad(configDir);
      expect(config).not.toBeNull();
      expect(config?.project?.name).toBe('found-it');
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });
});
