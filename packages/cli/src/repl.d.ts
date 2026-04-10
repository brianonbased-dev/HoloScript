/**
 * HoloScript REPL (Read-Eval-Print Loop)
 *
 * Interactive mode for HoloScript development
 */
interface REPLOptions {
    verbose: boolean;
    showAST: boolean;
    historySize: number;
}
export declare class HoloScriptREPL {
    private parser;
    private runtime;
    private rl;
    private options;
    private history;
    private multilineBuffer;
    private isMultiline;
    constructor(options?: Partial<REPLOptions>);
    private getPrompt;
    private updatePrompt;
    start(): Promise<void>;
    private printWelcome;
    private handleLine;
    private handleCommand;
    private printHelp;
    private showVariables;
    private showFunctions;
    private showHistory;
    private handleKnowledgeCommand;
    private displayKnowledgeResults;
    private loadFile;
    private evaluate;
    private displayResult;
}
export declare function startREPL(options?: Partial<REPLOptions>): Promise<void>;
export {};
