/**
 * DirectiveProcessor.ts
 *
 * Processes HoloScript+ @directives at parse-time, extracting:
 * - Trait bindings (e.g., @grabbable, @audio, @particles)
 * - Metadata (e.g., @version, @author, @description)
 * - Control flow hints (e.g., @if, @each, @slot)
 * - System hooks (e.g., @on, @emit, @networked)
 *
 * Works with the TraitBinder to validate that referenced trait handlers exist.
 */

import { TraitBinder } from './TraitBinder';

export interface ProcessedDirective {
  name: string;
  category: 'trait' | 'metadata' | 'control' | 'hook' | 'unknown';
  args: Record<string, any>;
  valid: boolean;
  error?: string;
}

export interface DirectiveProcessorResult {
  traits: ProcessedDirective[];
  metadata: ProcessedDirective[];
  controls: ProcessedDirective[];
  hooks: ProcessedDirective[];
  errors: ProcessedDirective[];
}

// Directive categories
const METADATA_DIRECTIVES = new Set([
  'version',
  'author',
  'description',
  'tags',
  'license',
  'deprecated',
]);
const CONTROL_DIRECTIVES = new Set(['if', 'each', 'slot', 'switch', 'case', 'default', 'for']);
const HOOK_DIRECTIVES = new Set(['on', 'emit', 'once', 'watch', 'computed', 'effect']);

export class DirectiveProcessor {
  private traitBinder: TraitBinder;

  constructor(traitBinder: TraitBinder) {
    this.traitBinder = traitBinder;
  }

  /**
   * Process an array of raw directives from the parser.
   */
  process(
    directives: Array<{ name: string; args?: Record<string, any> }>
  ): DirectiveProcessorResult {
    const result: DirectiveProcessorResult = {
      traits: [],
      metadata: [],
      controls: [],
      hooks: [],
      errors: [],
    };

    for (const directive of directives) {
      const processed = this.processOne(directive);
      switch (processed.category) {
        case 'trait':
          result.traits.push(processed);
          break;
        case 'metadata':
          result.metadata.push(processed);
          break;
        case 'control':
          result.controls.push(processed);
          break;
        case 'hook':
          result.hooks.push(processed);
          break;
        default:
          result.errors.push(processed);
      }
    }

    return result;
  }

  /**
   * Process a single directive.
   */
  processOne(directive: { name: string; args?: Record<string, any> }): ProcessedDirective {
    const name = directive.name;
    const args = directive.args || {};

    // Metadata directives
    if (METADATA_DIRECTIVES.has(name)) {
      return { name, category: 'metadata', args, valid: true };
    }

    // Control flow directives
    if (CONTROL_DIRECTIVES.has(name)) {
      return { name, category: 'control', args, valid: true };
    }

    // Hook directives
    if (HOOK_DIRECTIVES.has(name)) {
      return { name, category: 'hook', args, valid: true };
    }

    // Trait directives — check if handler exists
    if (this.traitBinder.has(name)) {
      return { name, category: 'trait', args, valid: true };
    }

    // Unknown directive
    return {
      name,
      category: 'unknown',
      args,
      valid: false,
      error: `Unknown directive '@${name}'. No trait handler registered.`,
    };
  }

  /**
   * Validate all directives, returning errors for invalid ones.
   */
  validate(directives: Array<{ name: string; args?: Record<string, any> }>): string[] {
    const errors: string[] = [];
    for (const d of directives) {
      const processed = this.processOne(d);
      if (!processed.valid && processed.error) {
        errors.push(processed.error);
      }
    }
    return errors;
  }
}

