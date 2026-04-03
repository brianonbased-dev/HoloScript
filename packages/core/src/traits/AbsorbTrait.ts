/**
 * @absorb Trait — Reverse-Mode: Legacy Code → Typed .hsplus Agents
 *
 * Analyzes Python (.py) or TypeScript (.ts) source files and generates
 * equivalent .hsplus agent templates. Works by:
 *   1. Extracting functions, classes, imports, and type annotations
 *   2. Mapping them to HoloScript agent patterns (templates, traits, event handlers)
 *   3. Generating canonically-valid .hsplus output
 *
 * Usage:
 *   holoscript absorb legacy.py --output agent.hsplus
 *   holoscript absorb service.ts --output service.hsplus
 *
 * Trait name: absorb
 * Category: interop
 * Compile targets: all
 */

export interface AbsorbSource {
  language: 'python' | 'typescript' | 'javascript';
  filePath: string;
  content: string;
}

export interface AbsorbedFunction {
  name: string;
  params: Array<{ name: string; type?: string }>;
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
  body?: string;
}

export interface AbsorbedClass {
  name: string;
  methods: AbsorbedFunction[];
  properties: Array<{ name: string; type?: string; value?: string }>;
  isExported: boolean;
  baseClass?: string;
}

export interface AbsorbedImport {
  source: string;
  specifiers: string[];
  isDefault: boolean;
}

export interface AbsorbResult {
  functions: AbsorbedFunction[];
  classes: AbsorbedClass[];
  imports: AbsorbedImport[];
  constants: Array<{ name: string; value: string; type?: string }>;
  generatedHSPlus: string;
  sourceLanguage: 'python' | 'typescript' | 'javascript';
  warnings: string[];
}

/**
 * AbsorbProcessor — Converts legacy Python/TS to .hsplus agents
 */
export class AbsorbProcessor {
  /**
   * Absorb a source file into .hsplus
   */
  absorb(source: AbsorbSource): AbsorbResult {
    const result: AbsorbResult = {
      functions: [],
      classes: [],
      imports: [],
      constants: [],
      generatedHSPlus: '',
      sourceLanguage: source.language,
      warnings: [],
    };

    switch (source.language) {
      case 'python':
        this.extractPython(source.content, result);
        break;
      case 'typescript':
      case 'javascript':
        this.extractTypeScript(source.content, result);
        break;
    }

    result.generatedHSPlus = this.generateHSPlus(result, source.filePath);
    return result;
  }

  /**
   * Extract structure from Python source
   */
  private extractPython(content: string, result: AbsorbResult): void {
    const lines = content.split('\n');

    // Extract imports
    for (const line of lines) {
      const importMatch = line.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
      if (importMatch) {
        result.imports.push({
          source: importMatch[1] || importMatch[2].trim(),
          specifiers: importMatch[2].split(',').map((s) => s.trim()),
          isDefault: !importMatch[1],
        });
      }
    }

    // Extract functions
    const funcRegex = /^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\w+))?:/gm;
    let funcMatch: RegExpExecArray | null;
    while ((funcMatch = funcRegex.exec(content)) !== null) {
      const params = funcMatch[3]
        .split(',')
        .filter((p) => p.trim() && p.trim() !== 'self')
        .map((p) => {
          const parts = p.trim().split(':');
          return { name: parts[0].trim(), type: parts[1]?.trim() };
        });

      result.functions.push({
        name: funcMatch[2],
        params,
        returnType: funcMatch[4] || undefined,
        isAsync: !!funcMatch[1],
        isExported: !funcMatch[2].startsWith('_'),
      });
    }

    // Extract classes with their methods
    const classRegex = /^class\s+(\w+)(?:\(([^)]*)\))?:/gm;
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRegex.exec(content)) !== null) {
      const cls: AbsorbedClass = {
        name: classMatch[1],
        methods: [],
        properties: [],
        isExported: !classMatch[1].startsWith('_'),
        baseClass: classMatch[2]?.trim(),
      };

      // Extract methods within this class using indentation-based scope
      const classStartIdx = classMatch.index + classMatch[0].length;
      const classBody = content.substring(classStartIdx);
      const methodRegex = /^(\s+)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\w+))?:/gm;
      let methodMatch: RegExpExecArray | null;
      while ((methodMatch = methodRegex.exec(classBody)) !== null) {
        // Stop if we hit a line with no indentation (next top-level def/class)
        const beforeMethod = classBody.substring(0, methodMatch.index);
        const lastNewline = beforeMethod.lastIndexOf('\n');
        if (lastNewline >= 0) {
          const lineStart = beforeMethod.substring(lastNewline + 1);
          if (lineStart.length > 0 && !lineStart.startsWith(' ') && !lineStart.startsWith('\t'))
            break;
        }

        const params = methodMatch[4]
          .split(',')
          .filter((p) => p.trim() && p.trim() !== 'self' && p.trim() !== 'cls')
          .map((p) => {
            const parts = p.trim().split(':');
            return { name: parts[0].trim(), type: parts[1]?.trim() };
          });

        cls.methods.push({
          name: methodMatch[3],
          params,
          returnType: methodMatch[5] || undefined,
          isAsync: !!methodMatch[2],
          isExported: !methodMatch[3].startsWith('_'),
        });

        // Extract self.prop = assignments from __init__
        if (methodMatch[3] === '__init__') {
          const initBody = classBody.substring(
            methodMatch.index + methodMatch[0].length,
            methodMatch.index + methodMatch[0].length + 500
          );
          const propRegex = /self\.(\w+)\s*=\s*(.+)/g;
          let propMatch: RegExpExecArray | null;
          while ((propMatch = propRegex.exec(initBody)) !== null) {
            cls.properties.push({
              name: propMatch[1],
              value: propMatch[2].trim(),
            });
          }
        }
      }

      result.classes.push(cls);
    }

    // Extract constants
    const constRegex = /^([A-Z_][A-Z0-9_]*)\s*[=:]\s*(.+)/gm;
    let constMatch: RegExpExecArray | null;
    while ((constMatch = constRegex.exec(content)) !== null) {
      result.constants.push({
        name: constMatch[1],
        value: constMatch[2].trim(),
      });
    }
  }

  /**
   * Extract structure from TypeScript/JavaScript source
   */
  private extractTypeScript(content: string, result: AbsorbResult): void {
    // Extract imports
    const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importRegex.exec(content)) !== null) {
      result.imports.push({
        source: importMatch[3],
        specifiers: importMatch[1]
          ? importMatch[1].split(',').map((s) => s.trim())
          : [importMatch[2]],
        isDefault: !!importMatch[2],
      });
    }

    // Extract functions
    const funcRegex = /(?:export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/g;
    let funcMatch: RegExpExecArray | null;
    while ((funcMatch = funcRegex.exec(content)) !== null) {
      const params = funcMatch[3]
        .split(',')
        .filter((p) => p.trim())
        .map((p) => {
          const parts = p.trim().split(':');
          return { name: parts[0].trim(), type: parts[1]?.trim() };
        });

      result.functions.push({
        name: funcMatch[2],
        params,
        returnType: funcMatch[4] || undefined,
        isAsync: !!funcMatch[1],
        isExported: content.includes(`export`) && content.includes(funcMatch[2]),
      });
    }

    // Extract classes with their methods
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRegex.exec(content)) !== null) {
      const cls: AbsorbedClass = {
        name: classMatch[1],
        methods: [],
        properties: [],
        isExported: content.includes(`export class ${classMatch[1]}`),
        baseClass: classMatch[2]?.trim(),
      };

      // Find class body using brace depth
      const bodyStart = classMatch.index + classMatch[0].length;
      let depth = 1;
      let bodyEnd = bodyStart;
      while (depth > 0 && bodyEnd < content.length) {
        if (content[bodyEnd] === '{') depth++;
        if (content[bodyEnd] === '}') depth--;
        bodyEnd++;
      }
      const classBody = content.substring(bodyStart, bodyEnd - 1);

      // Extract methods from class body
      const methodRegex =
        /(?:public|private|protected)?\s*(async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?\s*\{/g;
      let methodMatch: RegExpExecArray | null;
      while ((methodMatch = methodRegex.exec(classBody)) !== null) {
        const name = methodMatch[2];
        if (
          name === 'if' ||
          name === 'else' ||
          name === 'for' ||
          name === 'while' ||
          name === 'switch'
        )
          continue;
        const params = methodMatch[3]
          .split(',')
          .filter((p) => p.trim())
          .map((p) => {
            const parts = p.trim().split(':');
            return { name: parts[0].trim(), type: parts[1]?.trim() };
          });

        cls.methods.push({
          name,
          params,
          returnType: methodMatch[4] || undefined,
          isAsync: !!methodMatch[1],
          isExported: true,
        });
      }

      // Extract property declarations
      const propRegex = /(?:public|private|protected)?\s+(\w+)(?:\s*:\s*(\w+))?\s*=\s*([^;]+);/g;
      let propMatch: RegExpExecArray | null;
      while ((propMatch = propRegex.exec(classBody)) !== null) {
        cls.properties.push({
          name: propMatch[1],
          type: propMatch[2],
          value: propMatch[3]?.trim(),
        });
      }

      result.classes.push(cls);
    }

    // Extract const declarations
    const constRegex = /(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*(?::\s*\w+)?\s*=\s*(.+)/g;
    let constMatch: RegExpExecArray | null;
    while ((constMatch = constRegex.exec(content)) !== null) {
      result.constants.push({
        name: constMatch[1],
        value: constMatch[2].replace(/;$/, '').trim(),
      });
    }
  }

  /**
   * Generate .hsplus from absorbed structure
   */
  private generateHSPlus(result: AbsorbResult, sourceFile: string): string {
    const lines: string[] = [
      `// @absorb: auto-generated from ${sourceFile}`,
      `// Source language: ${result.sourceLanguage}`,
      `// Generated at: ${new Date().toISOString()}`,
      '',
    ];

    // Constants
    for (const c of result.constants) {
      lines.push(`state ${c.name}: ${c.type || 'dynamic'} = ${c.value}`);
    }
    if (result.constants.length > 0) lines.push('');

    // Classes → Templates
    for (const cls of result.classes) {
      lines.push(`template "${cls.name}" {`);
      if (cls.baseClass) {
        lines.push(`  @extends "${cls.baseClass}"`);
      }
      lines.push(`  @agent { type: "absorbed"; source: "${result.sourceLanguage}" }`);
      for (const prop of cls.properties) {
        lines.push(`  ${prop.name}: ${prop.value || `"${prop.type || 'dynamic'}"`}`);
      }
      for (const method of cls.methods) {
        const params = method.params.map((p) => p.name).join(', ');
        lines.push(`  on ${method.name}(${params}) {`);
        lines.push(`    // TODO: port ${method.name} logic`);
        lines.push(`  }`);
      }
      lines.push(`}`);
      lines.push('');
    }

    // Functions → Event handlers or standalone
    for (const fn of result.functions) {
      if (!fn.isExported) continue;
      const params = fn.params.map((p) => p.name).join(', ');
      const asyncPrefix = fn.isAsync ? 'async ' : '';
      lines.push(
        `${asyncPrefix}fn ${fn.name}(${params})${fn.returnType ? ` -> ${fn.returnType}` : ''} {`
      );
      lines.push(`  // TODO: port ${fn.name} logic from ${result.sourceLanguage}`);
      lines.push(`}`);
      lines.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
      lines.push('// WARNINGS:');
      for (const w of result.warnings) {
        lines.push(`//   ${w}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Trait definition for the standard traits registry
 */
export const ABSORB_TRAIT = {
  name: 'absorb',
  category: 'interop',
  description: 'Reverse-mode: convert legacy Python/TS/JS code into typed .hsplus agents',
  compileTargets: ['node', 'python', 'headless'],
  requiresRenderer: false,
  parameters: [
    { name: 'source', type: 'string', required: true, description: 'Path to source file' },
    {
      name: 'language',
      type: 'string',
      required: false,
      description: 'Source language (auto-detected from extension)',
    },
    { name: 'output', type: 'string', required: false, description: 'Output .hsplus file path' },
  ],
};

// ── Handler (delegates to AbsorbProcessor) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const absorbHandler = {
  name: 'absorb',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: any, ctx: TraitContext): void {
    const instance = new AbsorbProcessor();
    node.__absorb_instance = instance;
    ctx.emit('absorb_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: any, ctx: TraitContext): void {
    const instance = node.__absorb_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('absorb_detached', { node });
    delete node.__absorb_instance;
  },
  onEvent(node: HSPlusNode, _config: any, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__absorb_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'absorb_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('absorb_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: any, ctx: TraitContext, dt: number): void {
    const instance = node.__absorb_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
