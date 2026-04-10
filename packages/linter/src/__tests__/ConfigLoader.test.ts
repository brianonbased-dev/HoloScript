import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfigLoader } from '../ConfigLoader';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');

describe('ConfigLoader', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should load config from .hololintrc', () => {
    const loader = new ConfigLoader();
    const configPath = path.resolve('/app/.hololintrc');
    const startDir = path.resolve('/app/src/index.ts');

    vi.spyOn(fs, 'lstatSync').mockReturnValue({ isDirectory: () => false } as any);

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // Allow finding the config file when searching up from /app/src/
      const normalized = path.resolve(p as string);
      return normalized === configPath;
    });

    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        rules: { 'no-var': 'warn' },
      })
    );

    const config = loader.loadConfig(startDir);
    expect(config.rules['no-var']).toBe('warn');
  });

  it('should handle extends recursion', () => {
    const loader = new ConfigLoader();
    const baseConfigPath = path.resolve('/app/base.json');
    const childConfigPath = path.resolve('/app/.hololintrc');

    vi.spyOn(fs, 'lstatSync').mockReturnValue({ isDirectory: () => false } as any);
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const normalized = path.resolve(p as string);
      return normalized === childConfigPath || normalized === baseConfigPath;
    });

    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      // Normalize path for comparison
      const normalized = path.resolve(p as string);
      if (normalized === baseConfigPath) {
        return JSON.stringify({
          rules: { 'base-rule': 'error', 'override-me': 'warn' },
        });
      }
      if (normalized === childConfigPath) {
        return JSON.stringify({
          extends: './base.json',
          rules: { 'child-rule': 'error', 'override-me': 'error' },
        });
      }
      throw new Error(`File not found: ${p}`);
    });

    // Direct load to test extends logic validation
    const loadedConfig = loader.loadConfigFromFile(childConfigPath);

    expect(loadedConfig.rules['base-rule']).toBe('error');
    expect(loadedConfig.rules['child-rule']).toBe('error');
    expect(loadedConfig.rules['override-me']).toBe('error');
  });
});
