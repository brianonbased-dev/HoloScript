import * as fs from 'fs';
import * as path from 'path';
import { type FormatterConfig, DEFAULT_CONFIG } from './config';

export class ConfigLoader {
  private cache: Map<string, FormatterConfig> = new Map();

  /**
   * Load configuration for a specific file or directory.
   */
  public loadConfig(filePath: string): FormatterConfig {
    const configPath = this.findConfigFile(filePath);
    if (!configPath) {
      return { ...DEFAULT_CONFIG };
    }

    return this.loadConfigFromFile(configPath);
  }

  public loadConfigFromFile(configPath: string): FormatterConfig {
    if (this.cache.has(configPath)) {
      return this.cache.get(configPath)!;
    }

    let rawConfig: Record<string, unknown>;
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

    let options: Record<string, unknown> = rawConfig;
    if (configPath.endsWith('holoscript.config.json') && rawConfig.formatOptions && typeof rawConfig.formatOptions === 'object') {
      options = rawConfig.formatOptions as Record<string, unknown>;
    }

    const combinedConfig: FormatterConfig = {
      ...DEFAULT_CONFIG,
      ...(options as Partial<FormatterConfig>),
    };

    this.cache.set(configPath, combinedConfig);
    return combinedConfig;
  }

  private findConfigFile(startDir: string): string | null {
    // Ensure startDir is an absolute path
    const resolvedStartDir = path.resolve(startDir);
    let currentDir = fs.lstatSync(resolvedStartDir).isDirectory()
      ? resolvedStartDir
      : path.dirname(resolvedStartDir);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      const candidates = [
        'holoscript.config.json',
        '.holofmtrc',
        '.holofmtrc.json',
        '.holofmtrc.js',
        'holofmt.config.js',
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
}
