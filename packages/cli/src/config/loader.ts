import * as fs from 'fs';
import * as path from 'path';
import { HoloScriptConfig } from './schema';
import { mergeConfigs } from './merge';

export class ConfigLoader {
  private visitedFiles: Set<string>;

  constructor(visitedFiles?: Set<string>) {
    this.visitedFiles = visitedFiles ?? new Set<string>();
  }

  /**
   * Load and resolve configuration starting from a file
   */
  async loadConfig(configPath: string): Promise<HoloScriptConfig> {
    const absolutePath = path.resolve(configPath);

    if (this.visitedFiles.has(absolutePath)) {
      throw new Error(`Circular dependency detected in config inheritance: ${absolutePath}`);
    }

    this.visitedFiles.add(absolutePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Config file not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    let config: HoloScriptConfig;

    try {
      config = JSON.parse(content);
    } catch (e) {
      throw new Error(
        `Failed to parse config file ${absolutePath}: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    // Resolve inheritance
    if (config.extends) {
      const bases = Array.isArray(config.extends) ? config.extends : [config.extends];
      let mergedBase: HoloScriptConfig = {};

      for (const base of bases) {
        const baseConfig = await this.resolveAndLoadBase(base, path.dirname(absolutePath));
        mergedBase = mergeConfigs(mergedBase, baseConfig);
      }

      // Merge current config over the bases
      config = mergeConfigs(mergedBase, config);
    }

    return config;
  }

  private async resolveAndLoadBase(base: string, currentDir: string): Promise<HoloScriptConfig> {
    let basePath: string;

    if (base.startsWith('.')) {
      // Local file
      basePath = path.resolve(currentDir, base);
      if (!basePath.endsWith('.json')) {
        basePath += '.json';
      }
    } else {
      // Potential package name
      try {
        // Simple resolution for node_modules packages
        const packageJsonPath = require.resolve(`${base}/package.json`, { paths: [currentDir] });
        const pkgDir = path.dirname(packageJsonPath);
        basePath = path.join(pkgDir, 'holoscript.config.json');

        if (!fs.existsSync(basePath)) {
          // Try if the package itself points to a config
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          if (pkg.holoscriptConfig) {
            basePath = path.resolve(pkgDir, pkg.holoscriptConfig);
          } else {
            throw new Error(`Package ${base} does not contain a holoscript.config.json`);
          }
        }
      } catch (e) {
        throw new Error(
          `Could not resolve config package: ${base}. ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    const subLoader = new ConfigLoader(this.visitedFiles);
    return subLoader.loadConfig(basePath);
  }

  /**
   * Find and load config from CWD
   */
  static async findAndLoad(cwd: string = process.cwd()): Promise<HoloScriptConfig | null> {
    const configPath = path.join(cwd, 'holoscript.config.json');
    if (fs.existsSync(configPath)) {
      const loader = new ConfigLoader();
      return loader.loadConfig(configPath);
    }
    return null;
  }
}
