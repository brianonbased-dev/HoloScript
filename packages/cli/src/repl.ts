/**
 * HoloScript REPL (Read-Eval-Print Loop)
 *
 * Interactive mode for HoloScript development
 */

import * as readline from 'readline';
import { HoloScriptCodeParser, HoloScriptRuntime, enableConsoleLogging } from '@holoscript/core';
import type { ExecutionResult } from '@holoscript/core';
import { getKnowledgeClient } from './knowledge-client.js';

const VERSION = '2.5.0';

interface REPLOptions {
  verbose: boolean;
  showAST: boolean;
  historySize: number;
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export class HoloScriptREPL {
  private parser: HoloScriptCodeParser;
  private runtime: HoloScriptRuntime;
  private rl: readline.Interface;
  private options: REPLOptions;
  private history: string[] = [];
  private multilineBuffer: string = '';
  private isMultiline: boolean = false;

  constructor(options: Partial<REPLOptions> = {}) {
    this.options = {
      verbose: options.verbose ?? false,
      showAST: options.showAST ?? false,
      historySize: options.historySize ?? 100,
    };

    this.parser = new HoloScriptCodeParser();
    this.runtime = new HoloScriptRuntime();

    if (this.options.verbose) {
      enableConsoleLogging();
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
      historySize: this.options.historySize,
    });
  }

  private getPrompt(): string {
    if (this.isMultiline) {
      return `${COLORS.dim}...${COLORS.reset} `;
    }
    return `${COLORS.cyan}hs>${COLORS.reset} `;
  }

  private updatePrompt(): void {
    this.rl.setPrompt(this.getPrompt());
  }

  async start(): Promise<void> {
    this.printWelcome();

    this.rl.on('line', async (line) => {
      await this.handleLine(line);
      this.updatePrompt();
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log(`\n${COLORS.dim}Goodbye!${COLORS.reset}`);
      process.exit(0);
    });

    this.rl.prompt();
  }

  private printWelcome(): void {
    console.log(`
${COLORS.cyan}╔══════════════════════════════════════════════════════════╗
║           ${COLORS.bright}HoloScript REPL v${VERSION}${COLORS.reset}${COLORS.cyan}                   ║
║                                                            ║
║  Commands:                                                 ║
║    ${COLORS.yellow}.help${COLORS.cyan}     Show available commands                     ║
║    ${COLORS.yellow}.clear${COLORS.cyan}    Clear the screen                            ║
║    ${COLORS.yellow}.vars${COLORS.cyan}     Show all variables                          ║
║    ${COLORS.yellow}.funcs${COLORS.cyan}    Show all functions                          ║
║    ${COLORS.yellow}.reset${COLORS.cyan}    Reset runtime state                         ║
║    ${COLORS.yellow}.ast${COLORS.cyan}      Toggle AST display                          ║
║    ${COLORS.yellow}.k${COLORS.cyan}        Search knowledge hub (patterns/gotchas)    ║
║    ${COLORS.yellow}.exit${COLORS.cyan}     Exit the REPL                               ║
╚══════════════════════════════════════════════════════════╝${COLORS.reset}
`);
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();

    // Handle empty input
    if (!trimmed && !this.isMultiline) {
      return;
    }

    // Handle special commands
    if (trimmed.startsWith('.') && !this.isMultiline) {
      await this.handleCommand(trimmed);
      return;
    }

    // Handle multiline input
    if (trimmed.endsWith('{') || trimmed.endsWith('(')) {
      this.isMultiline = true;
      this.multilineBuffer += line + '\n';
      return;
    }

    if (this.isMultiline) {
      this.multilineBuffer += line + '\n';

      // Check if block is closed
      const openBraces = (this.multilineBuffer.match(/{/g) || []).length;
      const closeBraces = (this.multilineBuffer.match(/}/g) || []).length;
      const openParens = (this.multilineBuffer.match(/\(/g) || []).length;
      const closeParens = (this.multilineBuffer.match(/\)/g) || []).length;

      if (openBraces <= closeBraces && openParens <= closeParens) {
        this.isMultiline = false;
        await this.evaluate(this.multilineBuffer);
        this.multilineBuffer = '';
      }
      return;
    }

    // Regular single-line input
    await this.evaluate(line);
  }

  private async handleCommand(cmd: string): Promise<void> {
    const parts = cmd.split(/\s+/);
    const command = parts[0].toLowerCase();

    switch (command) {
      case '.help':
        this.printHelp();
        break;

      case '.clear':
        console.clear();
        this.printWelcome();
        break;

      case '.vars':
        this.showVariables();
        break;

      case '.funcs':
        this.showFunctions();
        break;

      case '.reset':
        this.runtime.reset();
        console.log(`${COLORS.green}Runtime state cleared.${COLORS.reset}`);
        break;

      case '.ast':
        this.options.showAST = !this.options.showAST;
        console.log(
          `${COLORS.yellow}AST display: ${this.options.showAST ? 'ON' : 'OFF'}${COLORS.reset}`
        );
        break;

      case '.exit':
      case '.quit':
        this.rl.close();
        break;

      case '.load':
        if (parts[1]) {
          await this.loadFile(parts[1]);
        } else {
          console.log(`${COLORS.red}Usage: .load <filename>${COLORS.reset}`);
        }
        break;

      case '.history':
        this.showHistory();
        break;

      case '.k':
      case '.knowledge':
        await this.handleKnowledgeCommand(parts.slice(1));
        break;

      default:
        console.log(`${COLORS.red}Unknown command: ${command}${COLORS.reset}`);
        console.log(`${COLORS.dim}Type .help for available commands${COLORS.reset}`);
    }
  }

  private printHelp(): void {
    console.log(`
${COLORS.bright}Available Commands:${COLORS.reset}

  ${COLORS.yellow}.help${COLORS.reset}            Show this help message
  ${COLORS.yellow}.clear${COLORS.reset}           Clear the screen
  ${COLORS.yellow}.vars${COLORS.reset}            Show all defined variables
  ${COLORS.yellow}.funcs${COLORS.reset}           Show all defined functions
  ${COLORS.yellow}.reset${COLORS.reset}           Reset runtime state (clear all)
  ${COLORS.yellow}.ast${COLORS.reset}             Toggle AST display for inputs
  ${COLORS.yellow}.load <file>${COLORS.reset}     Load and execute a HoloScript file
  ${COLORS.yellow}.history${COLORS.reset}         Show command history
  ${COLORS.yellow}.exit${COLORS.reset}            Exit the REPL

${COLORS.bright}Knowledge Hub Commands:${COLORS.reset}

  ${COLORS.yellow}.k search <query>${COLORS.reset}  Search all knowledge
  ${COLORS.yellow}.k patterns <q>${COLORS.reset}    Search patterns
  ${COLORS.yellow}.k gotchas <q>${COLORS.reset}     Search gotchas (common mistakes)
  ${COLORS.yellow}.k wisdom <q>${COLORS.reset}      Search wisdom entries
  ${COLORS.yellow}.k stats${COLORS.reset}           Show knowledge stats

${COLORS.bright}HoloScript Syntax Examples:${COLORS.reset}

  ${COLORS.cyan}orb myOrb { color: "#ff0000", glow: true }${COLORS.reset}
  ${COLORS.cyan}function greet(name: string) { return "Hello " + name }${COLORS.reset}
  ${COLORS.cyan}connect source to target as "data"${COLORS.reset}
  ${COLORS.cyan}const x = 42${COLORS.reset}
  ${COLORS.cyan}for (i = 0; i < 10; i++) { print(i) }${COLORS.reset}
`);
  }

  private showVariables(): void {
    const context = this.runtime.getContext();
    const vars = context.variables;

    if (vars.size === 0) {
      console.log(`${COLORS.dim}No variables defined.${COLORS.reset}`);
      return;
    }

    console.log(`\n${COLORS.bright}Variables:${COLORS.reset}`);
    vars.forEach((value, name) => {
      const type = typeof value;
      const display = JSON.stringify(value);
      console.log(
        `  ${COLORS.cyan}${name}${COLORS.reset}: ${COLORS.dim}${type}${COLORS.reset} = ${display}`
      );
    });
    console.log();
  }

  private showFunctions(): void {
    const context = this.runtime.getContext();
    const funcs = context.functions;

    if (funcs.size === 0) {
      console.log(`${COLORS.dim}No user-defined functions.${COLORS.reset}`);
      return;
    }

    console.log(`\n${COLORS.bright}Functions:${COLORS.reset}`);
    funcs.forEach((func, name) => {
      const params = func.parameters.map((p) => `${p.name}: ${p.dataType}`).join(', ');
      const returnType = func.returnType || 'void';
      console.log(
        `  ${COLORS.magenta}${name}${COLORS.reset}(${params}): ${COLORS.dim}${returnType}${COLORS.reset}`
      );
    });
    console.log();
  }

  private showHistory(): void {
    if (this.history.length === 0) {
      console.log(`${COLORS.dim}No history yet.${COLORS.reset}`);
      return;
    }

    console.log(`\n${COLORS.bright}History:${COLORS.reset}`);
    this.history.slice(-20).forEach((line, i) => {
      console.log(`  ${COLORS.dim}${i + 1}${COLORS.reset} ${line}`);
    });
    console.log();
  }

  private async handleKnowledgeCommand(args: string[]): Promise<void> {
    const subcommand = args[0]?.toLowerCase();
    const query = args.slice(1).join(' ');

    if (!subcommand) {
      console.log(`
${COLORS.bright}Knowledge Hub Commands:${COLORS.reset}

  ${COLORS.yellow}.k search <query>${COLORS.reset}    Search all knowledge
  ${COLORS.yellow}.k patterns <query>${COLORS.reset}  Search patterns
  ${COLORS.yellow}.k gotchas <query>${COLORS.reset}   Search gotchas
  ${COLORS.yellow}.k wisdom <query>${COLORS.reset}    Search wisdom
  ${COLORS.yellow}.k stats${COLORS.reset}             Show knowledge stats

${COLORS.dim}Example: .k search spread operator${COLORS.reset}
`);
      return;
    }

    const client = getKnowledgeClient();

    // Check availability
    const available = await client.isAvailable();
    if (!available) {
      console.log(`${COLORS.red}Knowledge Hub not available.${COLORS.reset}`);
      console.log(
        `${COLORS.dim}Start it with: docker-compose -f docker-compose.knowledge.yml up -d${COLORS.reset}`
      );
      return;
    }

    try {
      switch (subcommand) {
        case 's':
        case 'search': {
          if (!query) {
            console.log(`${COLORS.red}Usage: .k search <query>${COLORS.reset}`);
            return;
          }
          console.log(`${COLORS.dim}Searching...${COLORS.reset}`);
          const results = await client.search(query, { limit: 5 });
          this.displayKnowledgeResults(results);
          break;
        }

        case 'p':
        case 'patterns': {
          if (!query) {
            console.log(`${COLORS.red}Usage: .k patterns <query>${COLORS.reset}`);
            return;
          }
          console.log(`${COLORS.dim}Searching patterns...${COLORS.reset}`);
          const patterns = await client.getRelevantPatterns(query);
          if (patterns.length === 0) {
            console.log(`${COLORS.dim}No patterns found.${COLORS.reset}`);
          } else {
            patterns.forEach((p, i) => {
              console.log(`\n${COLORS.cyan}${i + 1}. ${p.id}: ${p.name}${COLORS.reset}`);
              console.log(`${COLORS.dim}Problem:${COLORS.reset} ${p.problem.slice(0, 100)}...`);
              console.log(`${COLORS.dim}Solution:${COLORS.reset} ${p.solution.slice(0, 100)}...`);
            });
          }
          break;
        }

        case 'g':
        case 'gotchas': {
          if (!query) {
            console.log(`${COLORS.red}Usage: .k gotchas <query>${COLORS.reset}`);
            return;
          }
          console.log(`${COLORS.dim}Searching gotchas...${COLORS.reset}`);
          const gotchas = await client.getRelevantGotchas(query);
          if (gotchas.length === 0) {
            console.log(`${COLORS.dim}No gotchas found.${COLORS.reset}`);
          } else {
            gotchas.forEach((g, i) => {
              console.log(`\n${COLORS.yellow}${i + 1}. ${g.id}${COLORS.reset}`);
              console.log(`${COLORS.red}Mistake:${COLORS.reset} ${g.mistake.slice(0, 100)}...`);
              console.log(`${COLORS.green}Fix:${COLORS.reset} ${g.fix.slice(0, 100)}...`);
            });
          }
          break;
        }

        case 'w':
        case 'wisdom': {
          if (!query) {
            console.log(`${COLORS.red}Usage: .k wisdom <query>${COLORS.reset}`);
            return;
          }
          console.log(`${COLORS.dim}Searching wisdom...${COLORS.reset}`);
          const wisdom = await client.getRelevantWisdom(query);
          if (wisdom.length === 0) {
            console.log(`${COLORS.dim}No wisdom found.${COLORS.reset}`);
          } else {
            wisdom.forEach((w, i) => {
              console.log(`\n${COLORS.magenta}${i + 1}. ${w.id}${COLORS.reset}`);
              console.log(`${w.insight.slice(0, 200)}...`);
            });
          }
          break;
        }

        case 'stats': {
          console.log(`${COLORS.dim}Fetching stats...${COLORS.reset}`);
          const stats = await client.getStats();
          console.log(`\n${COLORS.bright}Knowledge Base Stats:${COLORS.reset}`);
          console.log(`  Total entries: ${stats.totalEntries}`);
          console.log(`  Patterns: ${stats.byCategory.pattern}`);
          console.log(`  Gotchas: ${stats.byCategory.gotcha}`);
          console.log(`  Wisdom: ${stats.byCategory.wisdom}`);
          console.log(`  Research: ${stats.byCategory.research}`);
          console.log(`  Session: ${stats.byCategory.session}`);
          break;
        }

        default:
          console.log(`${COLORS.red}Unknown subcommand: ${subcommand}${COLORS.reset}`);
          console.log(`${COLORS.dim}Type .k for available commands${COLORS.reset}`);
      }
    } catch (error) {
      console.log(`${COLORS.red}Error: ${(error as Error).message}${COLORS.reset}`);
    }
  }

  private displayKnowledgeResults(results: any[]): void {
    if (results.length === 0) {
      console.log(`${COLORS.dim}No results found.${COLORS.reset}`);
      return;
    }

    console.log(`\n${COLORS.bright}Found ${results.length} results:${COLORS.reset}\n`);

    results.forEach((r, i) => {
      const categoryColor =
        {
          pattern: COLORS.cyan,
          gotcha: COLORS.yellow,
          wisdom: COLORS.magenta,
          research: COLORS.blue,
          session: COLORS.dim,
        }[r.metadata.category] || COLORS.reset;

      console.log(
        `${categoryColor}${i + 1}. [${r.score.toFixed(2)}] ${r.metadata.category}:${r.metadata.domain}${COLORS.reset}`
      );
      console.log(`   ${COLORS.dim}${r.metadata.source}${COLORS.reset}`);
      console.log(`   ${r.content.slice(0, 150).replace(/\n/g, ' ')}...`);
      console.log();
    });
  }

  private async loadFile(filename: string): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const filePath = path.resolve(process.cwd(), filename);
      const content = fs.readFileSync(filePath, 'utf-8');

      console.log(`${COLORS.dim}Loading ${filename}...${COLORS.reset}`);
      await this.evaluate(content);
      console.log(`${COLORS.green}Loaded successfully.${COLORS.reset}`);
    } catch (error) {
      console.log(`${COLORS.red}Error loading file: ${(error as Error).message}${COLORS.reset}`);
    }
  }

  private async evaluate(code: string): Promise<void> {
    try {
      // Add to history
      this.history.push(code.trim());
      if (this.history.length > this.options.historySize) {
        this.history.shift();
      }

      // Parse
      const parseResult = this.parser.parse(code);

      if (!parseResult.success) {
        parseResult.errors.forEach((err) => {
          console.log(
            `${COLORS.red}Parse error at line ${err.line}:${err.column}: ${err.message}${COLORS.reset}`
          );
        });
        return;
      }

      if (parseResult.ast.length === 0) {
        return;
      }

      // Show AST if enabled
      if (this.options.showAST) {
        console.log(`${COLORS.dim}AST:${COLORS.reset}`);
        console.log(JSON.stringify(parseResult.ast, null, 2));
      }

      // Execute
      const results = await this.runtime.executeProgram(parseResult.ast);

      // Display results
      for (const result of results) {
        this.displayResult(result);
      }
    } catch (error) {
      console.log(`${COLORS.red}Error: ${(error as Error).message}${COLORS.reset}`);
    }
  }

  private displayResult(result: ExecutionResult): void {
    if (!result.success) {
      console.log(`${COLORS.red}Error: ${result.error}${COLORS.reset}`);
      return;
    }

    if (result.output !== undefined) {
      const output =
        typeof result.output === 'object'
          ? JSON.stringify(result.output, null, 2)
          : String(result.output);
      console.log(`${COLORS.green}=> ${output}${COLORS.reset}`);
    }

    if (result.spatialPosition) {
      const pos = result.spatialPosition;
      console.log(`${COLORS.dim}   @ (${pos.x}, ${pos.y}, ${pos.z})${COLORS.reset}`);
    }
  }
}

// Main entry point for REPL
export async function startREPL(options: Partial<REPLOptions> = {}): Promise<void> {
  const repl = new HoloScriptREPL(options);
  await repl.start();
}
