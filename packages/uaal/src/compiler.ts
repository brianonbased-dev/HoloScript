/**
 * uAAL Compiler — Intent to Bytecode
 *
 * Compiles structured intent declarations into UAALBytecode.
 * Supports the 7-phase cognitive protocol, conditional branching,
 * parallel execution, and parameterized operations.
 *
 * Intent language:
 *   INTAKE("source")              → absorb knowledge from source
 *   REFLECT                       → evaluate current state
 *   EXECUTE("task")               → perform action
 *   COMPRESS                      → consolidate learned patterns
 *   REINTAKE                      → re-evaluate with compressed knowledge
 *   GROW                          → learn new patterns from experience
 *   EVOLVE                        → adapt behavior based on growth
 *   CYCLE("task")                 → run full 7-phase protocol
 *   IF condition THEN ... END     → conditional execution
 *   PARALLEL { ... }              → concurrent execution
 *   INVOKE_LLM("prompt")         → call external LLM
 *   SPAWN_AGENT("name")          → create child agent
 *   SHARE_WISDOM("topic")        → publish to knowledge mesh
 *   ANCHOR                        → create temporal snapshot
 *   DELAY(ms)                     → pause execution
 *
 * @version 2.0.0
 */

import { UAALOpCode, UAALBytecode, UAALInstruction } from './opcodes';

// =============================================================================
// TOKENIZER
// =============================================================================

type TokenType = 'KEYWORD' | 'STRING' | 'NUMBER' | 'LPAREN' | 'RPAREN' | 'LBRACE' | 'RBRACE' | 'COMMA' | 'NEWLINE' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  line: number;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;

  while (i < source.length) {
    const ch = source[i];

    // Whitespace (not newline)
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }

    // Comments
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }

    // Newline
    if (ch === '\n') { tokens.push({ type: 'NEWLINE', value: '\n', line }); line++; i++; continue; }

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      i++;
      while (i < source.length && source[i] !== quote) { str += source[i]; i++; }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str, line });
      continue;
    }

    // Numbers
    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (i < source.length && ((source[i] >= '0' && source[i] <= '9') || source[i] === '.')) { num += source[i]; i++; }
      tokens.push({ type: 'NUMBER', value: num, line });
      continue;
    }

    // Punctuation
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(', line }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')', line }); i++; continue; }
    if (ch === '{') { tokens.push({ type: 'LBRACE', value: '{', line }); i++; continue; }
    if (ch === '}') { tokens.push({ type: 'RBRACE', value: '}', line }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',', line }); i++; continue; }

    // Keywords / identifiers
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
      let word = '';
      while (i < source.length && ((source[i] >= 'A' && source[i] <= 'Z') || (source[i] >= 'a' && source[i] <= 'z') || (source[i] >= '0' && source[i] <= '9') || source[i] === '_')) {
        word += source[i]; i++;
      }
      tokens.push({ type: 'KEYWORD', value: word.toUpperCase(), line });
      continue;
    }

    // Unknown — skip
    i++;
  }

  tokens.push({ type: 'EOF', value: '', line });
  return tokens;
}

// =============================================================================
// PARSER + CODE GENERATOR
// =============================================================================

const KEYWORD_TO_OPCODE: Record<string, UAALOpCode> = {
  // 7-phase cognitive protocol
  INTAKE: UAALOpCode.INTAKE,
  REFLECT: UAALOpCode.REFLECT,
  COMPRESS: UAALOpCode.COMPRESS,
  EXECUTE: UAALOpCode.EXECUTE,
  REINTAKE: UAALOpCode.REINTAKE,
  GROW: UAALOpCode.GROW,
  EVOLVE: UAALOpCode.EVOLVE,

  // Aliases
  LEARN: UAALOpCode.INTAKE,
  THINK: UAALOpCode.REFLECT,
  DO: UAALOpCode.EXECUTE,
  STORE: UAALOpCode.COMPRESS,
  REVIEW: UAALOpCode.REINTAKE,
  ADAPT: UAALOpCode.EVOLVE,

  // Stack
  PUSH: UAALOpCode.PUSH,
  POP: UAALOpCode.POP,

  // Real-world integration
  INVOKE_LLM: UAALOpCode.OP_INVOKE_LLM,
  IOT_ACTION: UAALOpCode.OP_IOT_ACTION,
  PAY: UAALOpCode.OP_PAY,

  // Swarm
  SPAWN_AGENT: UAALOpCode.OP_SPAWN_AGENT,
  SHARE_WISDOM: UAALOpCode.OP_SHARE_WISDOM,
  EVOLVE_CODE: UAALOpCode.OP_EVOLVE_CODE,

  // HoloScript integration
  RENDER: UAALOpCode.OP_RENDER_HOLOGRAM,
  SPATIAL_ANCHOR: UAALOpCode.OP_SPATIAL_ANCHOR,
  VR_TELEPORT: UAALOpCode.OP_VR_TELEPORT,
  EVAL_METRIC: UAALOpCode.OP_EVAL_METRIC,

  // Temporal
  ANCHOR: UAALOpCode.CLOCK_ANCHOR,
  SNAPSHOT: UAALOpCode.CLOCK_ANCHOR,
  AUDIT: UAALOpCode.CLOCK_AUDIT,
  DELAY: UAALOpCode.OP_DELAY,

  // Control
  HALT: UAALOpCode.HALT,

  // Orchestration
  CHECKPOINT: UAALOpCode.OP_CHECKPOINT,
  RESTORE: UAALOpCode.OP_RESTORE,

  // Error handling
  ASSERT: UAALOpCode.OP_ASSERT,
};

export class UAALCompiler {
  private tokens: Token[] = [];
  private pos = 0;

  /**
   * Compile a structured intent program into bytecode.
   *
   * @example
   * ```
   * compiler.compile(`
   *   INTAKE("arxiv papers on CRDT")
   *   REFLECT
   *   EXECUTE("summarize findings")
   *   COMPRESS
   *   SHARE_WISDOM("crdt-patterns")
   * `)
   * ```
   */
  compile(source: string): UAALBytecode {
    this.tokens = tokenize(source);
    this.pos = 0;
    const instructions: UAALInstruction[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const instr = this.parseStatement();
      if (instr) instructions.push(...instr);
    }

    // Always end with HALT if not already present
    if (instructions.length === 0 || instructions[instructions.length - 1].opCode !== UAALOpCode.HALT) {
      instructions.push({ opCode: UAALOpCode.HALT });
    }

    return { version: 2, instructions };
  }

  /**
   * Compile a simple intent string (backwards compatible with v1).
   * Handles plain English like "learn about X then execute Y".
   */
  compileIntent(intent: string): UAALBytecode {
    // Try structured parse first
    try {
      const result = this.compile(intent);
      if (result.instructions.length > 1) return result; // More than just HALT
    } catch {
      // Fall through to keyword extraction
    }

    // Fallback: extract keywords from natural language
    const instructions: UAALInstruction[] = [];
    const upper = intent.toUpperCase();
    const words = upper.split(/\s+/);

    for (const word of words) {
      const clean = word.replace(/[^A-Z_]/g, '');
      if (KEYWORD_TO_OPCODE[clean] && !instructions.some(i => i.opCode === KEYWORD_TO_OPCODE[clean])) {
        instructions.push({ opCode: KEYWORD_TO_OPCODE[clean] });
      }
    }

    if (instructions.length === 0) {
      // No recognized keywords — default to full cycle
      return this.buildFullCycle(intent);
    }

    instructions.push({ opCode: UAALOpCode.HALT });
    return { version: 2, instructions };
  }

  /**
   * Build a complete 7-phase cycle as bytecode
   */
  buildFullCycle(task: string): UAALBytecode {
    return {
      version: 2,
      instructions: [
        { opCode: UAALOpCode.PUSH, operands: [task] },
        { opCode: UAALOpCode.INTAKE },
        { opCode: UAALOpCode.REFLECT },
        { opCode: UAALOpCode.EXECUTE },
        { opCode: UAALOpCode.COMPRESS },
        { opCode: UAALOpCode.REINTAKE },
        { opCode: UAALOpCode.GROW },
        { opCode: UAALOpCode.EVOLVE },
        { opCode: UAALOpCode.HALT },
      ],
    };
  }

  /**
   * Build bytecode from raw instructions
   */
  buildBytecode(instructions: UAALInstruction[], version: number = 2): UAALBytecode {
    return { version, instructions };
  }

  // ─── Parser ─────────────────────────────────────────────────────────

  private parseStatement(): UAALInstruction[] | null {
    const token = this.peek();
    if (!token || token.type === 'EOF') return null;

    if (token.type === 'KEYWORD') {
      // CYCLE("task") — expand to full 7-phase
      if (token.value === 'CYCLE') {
        this.advance();
        const arg = this.parseArgs();
        const task = arg[0] ?? 'default';
        return [
          { opCode: UAALOpCode.PUSH, operands: [task] },
          { opCode: UAALOpCode.INTAKE },
          { opCode: UAALOpCode.REFLECT },
          { opCode: UAALOpCode.EXECUTE },
          { opCode: UAALOpCode.COMPRESS },
          { opCode: UAALOpCode.REINTAKE },
          { opCode: UAALOpCode.GROW },
          { opCode: UAALOpCode.EVOLVE },
        ];
      }

      // IF condition THEN ... END
      if (token.value === 'IF') {
        return this.parseIf();
      }

      // PARALLEL { ... }
      if (token.value === 'PARALLEL') {
        return this.parseParallel();
      }

      // Standard opcode with optional args
      const opcode = KEYWORD_TO_OPCODE[token.value];
      if (opcode !== undefined) {
        this.advance();
        const args = this.parseArgs();
        const instr: UAALInstruction = { opCode: opcode };
        if (args.length > 0) {
          // Push args onto stack before the opcode
          const result: UAALInstruction[] = [];
          for (const arg of args) {
            result.push({ opCode: UAALOpCode.PUSH, operands: [arg] });
          }
          result.push(instr);
          return result;
        }
        return [instr];
      }

      // Unknown keyword — skip
      this.advance();
      return null;
    }

    // Skip non-keyword tokens
    this.advance();
    return null;
  }

  private parseIf(): UAALInstruction[] {
    this.advance(); // consume IF
    const instructions: UAALInstruction[] = [];

    // Condition — read until THEN
    const condTokens: string[] = [];
    while (!this.isAtEnd() && this.peek()?.value !== 'THEN') {
      condTokens.push(this.advance().value);
    }
    if (this.peek()?.value === 'THEN') this.advance();

    // Push condition string and assert
    instructions.push({ opCode: UAALOpCode.PUSH, operands: [condTokens.join(' ')] });
    instructions.push({ opCode: UAALOpCode.OP_ASSERT });

    // Body — read until END
    const bodyStart = instructions.length;
    while (!this.isAtEnd() && this.peek()?.value !== 'END') {
      this.skipNewlines();
      if (this.peek()?.value === 'END') break;
      const stmt = this.parseStatement();
      if (stmt) instructions.push(...stmt);
    }
    if (this.peek()?.value === 'END') this.advance();

    // JUMP_IF over body (jump target = body length)
    // Insert at bodyStart: JUMP_IF to skip body if assertion failed
    instructions.splice(bodyStart, 0, {
      opCode: UAALOpCode.JUMP_IF,
      operands: [instructions.length - bodyStart + 1],
    });

    return instructions;
  }

  private parseParallel(): UAALInstruction[] {
    this.advance(); // consume PARALLEL
    const instructions: UAALInstruction[] = [];

    instructions.push({ opCode: UAALOpCode.OP_SPAWN_PARALLEL });

    if (this.peek()?.type === 'LBRACE') this.advance();

    while (!this.isAtEnd() && this.peek()?.type !== 'RBRACE') {
      this.skipNewlines();
      if (this.peek()?.type === 'RBRACE') break;
      const stmt = this.parseStatement();
      if (stmt) instructions.push(...stmt);
    }

    if (this.peek()?.type === 'RBRACE') this.advance();

    instructions.push({ opCode: UAALOpCode.OP_AWAIT_ALL });
    return instructions;
  }

  private parseArgs(): (string | number)[] {
    const args: (string | number)[] = [];
    if (this.peek()?.type !== 'LPAREN') return args;
    this.advance(); // consume (

    while (!this.isAtEnd() && this.peek()?.type !== 'RPAREN') {
      const token = this.advance();
      if (token.type === 'STRING') args.push(token.value);
      else if (token.type === 'NUMBER') args.push(parseFloat(token.value));
      else if (token.type === 'KEYWORD') args.push(token.value);
      // Skip commas
    }

    if (this.peek()?.type === 'RPAREN') this.advance();
    return args;
  }

  // ─── Token Helpers ──────────────────────────────────────────────────

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }
  private isAtEnd(): boolean { return this.pos >= this.tokens.length || this.tokens[this.pos].type === 'EOF'; }
  private skipNewlines(): void { while (this.peek()?.type === 'NEWLINE') this.advance(); }
}
