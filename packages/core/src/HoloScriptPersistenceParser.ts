import {
  ASTNode,
  MemoryNode,
  SemanticMemoryNode,
  EpisodicMemoryNode,
  ProceduralMemoryNode,
  HoloScriptValue,
} from './types';

// We need a minimal interface for the parser context to consume tokens
export interface Token {
  type: string;
  value: string;
  line: number;
  column: number;
}

export interface ParserContext {
  position: number;
  tokens: Token[];
  currentToken(): Token | undefined;
  advance(): Token | undefined;
  check(type: string, value?: string): boolean;
  expect(type: string, value?: string): boolean;
  expectIdentifier(): string | null;
  parseObject(): Record<string, unknown>;
  skipNewlines(): void;
}

/**
 * Modular parser specifically dedicated to parsing AI Persistence constructs.
 * Handing memory, semantic, episodic, and procedural primitives.
 */
export class HoloScriptPersistenceParser {
  private ctx: ParserContext;

  constructor(context: ParserContext) {
    this.ctx = context;
  }

  /**
   * Parse memory primitive block
   * memory <Name> { semantic: SemanticMemory { ... }, episodic: EpisodicMemory { ... }, procedural: ProceduralMemory { ... } }
   */
  public parseMemory(): MemoryNode | null {
    const startToken = this.ctx.check('keyword', 'memory');
    if (!startToken) {
      return null;
    }
    this.ctx.advance();

    const name = this.ctx.expectIdentifier() || 'UnnamedMemory';

    const node: MemoryNode = {
      type: 'memory',
      name,
      position: { x: 0, y: 0, z: 0 },
    };

    if (this.ctx.check('punctuation', '{')) {
      this.ctx.advance(); // {

      while (!this.ctx.check('punctuation', '}') && this.ctx.position < this.ctx.tokens.length) {
        this.ctx.skipNewlines();
        if (this.ctx.check('punctuation', '}')) break;

        const keyToken = this.ctx.currentToken();
        if (!keyToken || (keyToken.type !== 'identifier' && keyToken.type !== 'keyword')) {
          this.ctx.advance();
          continue;
        }

        const key = keyToken.value;
        this.ctx.advance(); // property name

        if (this.ctx.check('punctuation', ':')) {
          this.ctx.advance(); // :
        }

        const typeToken = this.ctx.currentToken();
        if (typeToken && (typeToken.type === 'identifier' || typeToken.type === 'keyword')) {
          this.ctx.advance(); // type name

          if (this.ctx.check('punctuation', '{')) {
            const properties = this.ctx.parseObject() as Record<string, HoloScriptValue>;

            if (key === 'semantic' && typeToken.value === 'SemanticMemory') {
              node.semantic = {
                type: 'semantic-memory',
                properties,
                position: { x: 0, y: 0, z: 0 },
              };
            } else if (key === 'episodic' && typeToken.value === 'EpisodicMemory') {
              node.episodic = {
                type: 'episodic-memory',
                properties,
                position: { x: 0, y: 0, z: 0 },
              };
            } else if (key === 'procedural' && typeToken.value === 'ProceduralMemory') {
              node.procedural = {
                type: 'procedural-memory',
                properties,
                position: { x: 0, y: 0, z: 0 },
              };
            }
          }
        }

        if (this.ctx.check('punctuation', ',')) {
          this.ctx.advance(); // ,
        }
      }

      this.ctx.expect('punctuation', '}');
    }

    return node;
  }
}
