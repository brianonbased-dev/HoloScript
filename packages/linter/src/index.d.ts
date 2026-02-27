/**
 * HoloScript Linter
 *
 * Static analysis tool for HoloScript (.holo) and HoloScript+ (.hsplus) files.
 * Enforces best practices, catches errors, and improves code quality.
 *
 * @package @hololand/holoscript-linter
 * @version 2.0.0
 */
export * from './types';
import type { LintResult, LinterConfig, Rule } from './types';
export declare const DEFAULT_CONFIG: LinterConfig;
export declare class HoloScriptLinter {
    private config;
    private rules;
    constructor(config?: Partial<LinterConfig>);
    /**
     * Lint HoloScript or HoloScript+ code
     */
    lint(source: string, filePath?: string): LintResult;
    /**
     * Register a custom rule
     */
    registerRule(rule: Rule): void;
    /**
     * Get all registered rules
     */
    getRules(): Rule[];
    private getSeverity;
    private getRuleOptions;
    getConfig(): LinterConfig;
    setConfig(config: Partial<LinterConfig>): void;
}
/**
 * Lint HoloScript code with default config
 */
export declare function lint(source: string, filePath?: string): LintResult;
/**
 * Create a linter with custom config
 */
export declare function createLinter(config?: Partial<LinterConfig>): HoloScriptLinter;
export { noDeadCodeRule, createNoDeadCodeRule, type NoDeadCodeOptions } from './rules/no-dead-code';
export { deprecationWarningRule, createDeprecationWarningRule, type DeprecationWarningOptions, type DeprecationEntry, } from './rules/deprecation-warning';
export default HoloScriptLinter;
