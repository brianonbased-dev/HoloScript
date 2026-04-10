import * as fs from 'fs';
import * as path from 'path';
import { type LinterConfig, DEFAULT_CONFIG } from './index';

export class ConfigLoader {
  private cache: Map<string, LinterConfig> = new Map();

  /**
   * Load configuration for a specific file or directory.
   * Walks up the directory tree to find config files.
   */
  public loadConfig(filePath: string): LinterConfig {
    const configPath = this.findConfigFile(filePath);
    if (!configPath) {
      return { ...DEFAULT_CONFIG };
    }

    return this.loadConfigFromFile(configPath);
  }

  /**
   * Load configuration from a specific config file path.
   * Handles 'extends' recursion.
   */
  public loadConfigFromFile(configPath: string): LinterConfig {
    if (this.cache.has(configPath)) {
      return this.cache.get(configPath)!;
    }

    let rawConfig: any;
    try {
      if (configPath.endsWith('.js')) {
        rawConfig = require(configPath);
      } else {
        const content = fs.readFileSync(configPath, 'utf8');
        rawConfig = JSON.parse(content);
      }
    } catch (error) {
      console.error(`Failed to load config from ${configPath}:`, error);
      return { ...DEFAULT_CONFIG };
    }

    let combinedConfig: LinterConfig = {
      rules: {},
      ignorePatterns: [],
      maxErrors: 100,
      typeChecking: true,
      ...rawConfig, // Base config
    };

    // Handle 'extends'
    if (rawConfig.extends) {
      const extensions = Array.isArray(rawConfig.extends) ? rawConfig.extends : [rawConfig.extends];

      for (const ext of extensions) {
        let extPath = ext;
        // Resolve path relative to current config file
        if (ext.startsWith('.')) {
          extPath = path.resolve(path.dirname(configPath), ext);
        } else {
          // Assume node module or absolute path (simplified)
          try {
            extPath = require.resolve(ext, { paths: [path.dirname(configPath)] });
          } catch (_e) {
            console.warn(`Could not resolve config extension: ${ext}`);
            continue; // Skip if not found
          }
        }

        const baseConfig = this.loadConfigFromFile(extPath);
        combinedConfig = this.mergeConfigs(baseConfig, combinedConfig);
      }
    }

    // Merge with defaults if no extends (or as base fallback logic)
    // Actually, usually we merge explicit config ON TOP of defaults.
    // So defaults should be the very base.
    // If 'extends' was present, we merged extensions first.
    // Now we should ensure we have defaults for missing keys.
    combinedConfig = this.mergeConfigs({ ...DEFAULT_CONFIG }, combinedConfig);

    this.cache.set(configPath, combinedConfig);
    return combinedConfig;
  }

  private findConfigFile(startDir: string): string | null {
    let currentDir = fs.lstatSync(startDir).isDirectory() ? startDir : path.dirname(startDir);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      const candidates = [
        '.hololintrc',
        '.hololintrc.json',
        '.hololintrc.js',
        'hololint.config.js',
      ];

      for (const candidate of candidates) {
        const candidatePath = path.join(currentDir, candidate);
        if (fs.existsSync(candidatePath)) {
          return candidatePath;
        }
      }

      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  private mergeConfigs(base: LinterConfig, override: LinterConfig): LinterConfig {
    return {
      ...base,
      ...override,
      rules: {
        ...base.rules,
        ...override.rules,
      },
      ignorePatterns: [...(base.ignorePatterns || []), ...(override.ignorePatterns || [])],
      // Primitive types (maxErrors, typeChecking) are overwritten by spread above
    };
  }
}
