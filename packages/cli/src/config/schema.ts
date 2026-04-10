/**
 * HoloScript Configuration Schema
 */

export interface HoloScriptConfig {
  /**
   * Path to another config file to extend.
   * Can be a local path or a package name.
   */
  extends?: string | string[];

  /**
   * Compiler options
   */
  compilerOptions?: {
    target?: 'threejs' | 'unity' | 'vrchat' | 'babylon';
    outputDir?: string;
    strict?: boolean;
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };

  /**
   * Formatting options
   */
  formatOptions?: {
    indentSize?: number;
    useTabs?: boolean;
    semicolons?: boolean;
    singleQuote?: boolean;
    preserveRawBlocks?: boolean;
  };

  /**
   * Linter options
   */
  lintOptions?: {
    noUnusedVariables?: boolean;
    noUnusedOrbs?: boolean;
    requireAltText?: boolean;
  };

  /**
   * Project metadata
   */
  project?: {
    name?: string;
    version?: string;
    description?: string;
    author?: string;
  };

  /**
   * AI / Brittney settings
   */
  aiOptions?: {
    brittneyUrl?: string;
    confidenceThreshold?: number;
    enableVoice?: boolean;
  };
}
