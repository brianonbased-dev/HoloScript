/**
 * DebugConsole — REPL with command history, autocomplete, and variable watch
 *
 * @version 1.0.0
 */

export interface ConsoleCommand {
  name: string;
  description: string;
  handler: (args: string[]) => string;
}

export interface ConsoleEntry {
  type: 'input' | 'output' | 'error';
  text: string;
  timestamp: number;
}

export class DebugConsole {
  private commands: Map<string, ConsoleCommand> = new Map();
  private history: ConsoleEntry[] = [];
  private commandHistory: string[] = [];
  private historyIndex: number = -1;
  private watchedVariables: Map<string, () => unknown> = new Map();
  private maxHistory: number;
  private open: boolean = false;

  constructor(maxHistory: number = 200) {
    this.maxHistory = maxHistory;
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    this.registerCommand({
      name: 'help',
      description: 'List all commands',
      handler: () => {
        return [...this.commands.values()].map((c) => `${c.name} - ${c.description}`).join('\n');
      },
    });
    this.registerCommand({
      name: 'clear',
      description: 'Clear console',
      handler: () => {
        this.history = [];
        return 'Console cleared';
      },
    });
    this.registerCommand({
      name: 'watch',
      description: 'List watched variables',
      handler: () => {
        if (this.watchedVariables.size === 0) return 'No watched variables';
        return [...this.watchedVariables.entries()]
          .map(([k, fn]) => `${k} = ${JSON.stringify(fn())}`)
          .join('\n');
      },
    });
  }

  /**
   * Register a command
   */
  registerCommand(cmd: ConsoleCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  /**
   * Execute a command string
   */
  execute(input: string): string {
    this.addEntry('input', input);
    this.commandHistory.push(input);
    this.historyIndex = this.commandHistory.length;

    const parts = input.trim().split(/\s+/);
    const cmdName = parts[0];
    const args = parts.slice(1);

    const cmd = this.commands.get(cmdName);
    if (!cmd) {
      const error = `Unknown command: ${cmdName}`;
      this.addEntry('error', error);
      return error;
    }

    try {
      const result = cmd.handler(args);
      this.addEntry('output', result);
      return result;
    } catch (err) {
      const error = `Error: ${err instanceof Error ? err.message : String(err)}`;
      this.addEntry('error', error);
      return error;
    }
  }

  /**
   * Autocomplete a partial command
   */
  autocomplete(partial: string): string[] {
    return [...this.commands.keys()].filter((name) => name.startsWith(partial)).sort();
  }

  /**
   * Navigate command history
   */
  historyUp(): string | null {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      return this.commandHistory[this.historyIndex];
    }
    return null;
  }

  historyDown(): string | null {
    if (this.historyIndex < this.commandHistory.length - 1) {
      this.historyIndex++;
      return this.commandHistory[this.historyIndex];
    }
    this.historyIndex = this.commandHistory.length;
    return null;
  }

  /**
   * Watch a variable
   */
  watchVariable(name: string, getter: () => unknown): void {
    this.watchedVariables.set(name, getter);
  }

  unwatchVariable(name: string): boolean {
    return this.watchedVariables.delete(name);
  }

  getWatchedValues(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, fn] of this.watchedVariables) result[k] = fn();
    return result;
  }

  private addEntry(type: ConsoleEntry['type'], text: string): void {
    this.history.push({ type, text, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  toggle(): void {
    this.open = !this.open;
  }
  isOpen(): boolean {
    return this.open;
  }
  getHistory(): ConsoleEntry[] {
    return [...this.history];
  }
  getCommandCount(): number {
    return this.commands.size;
  }
}
