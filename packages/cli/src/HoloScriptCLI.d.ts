/**
 * HoloScript CLI main class
 */
import type { CLIOptions } from './args';
export declare class HoloScriptCLI {
    private parser;
    private runtime;
    private options;
    private config;
    constructor(options: CLIOptions);
    run(): Promise<number>;
    private parseCommand;
    private runCommand;
    private astCommand;
    private readInput;
    private writeOutput;
    private replCommand;
    private importCommand;
    private visualizeCommand;
}
