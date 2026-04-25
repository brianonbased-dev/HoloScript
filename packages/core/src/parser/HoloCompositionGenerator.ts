import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloLogic,
  HoloEventHandler,
  HoloAction,
  HoloStatement,
  HoloExpression,
  HoloValue,
  PlatformConstraint,
  SourceRange
} from './HoloCompositionTypes';

export function generateHoloSource(ast: HoloComposition): string {
  const lines: string[] = [];

  lines.push(`composition "${escapeString(ast.name)}" {`);

  // Root traits
  if (ast.traits && ast.traits.length > 0) {
    for (const trait of ast.traits) {
      lines.push(`  ${emitTrait(trait)}`);
    }
  }

  // Spatial Groups
  for (const group of ast.spatialGroups) {
    lines.push(`  spatial_group "${escapeString(group.name)}" {`);
    for (const obj of group.objects) {
      emitObject(obj, lines, 4);
    }
    lines.push(`  }`);
    lines.push('');
  }

  // Objects
  for (const obj of ast.objects) {
    emitObject(obj, lines, 2);
  }

  // Logic
  if (ast.logic && ast.logic.handlers.length > 0) {
    lines.push(`  logic {`);
    for (const handler of ast.logic.handlers) {
      lines.push(`    ${handler.event}(${handler.parameters.map(p => escapeString(p.name)).join(', ')}) {`);
      // Since it's a simple AST-to-string for our current use-case, we emit minimal logic bodies or raw statements if we had a string
      // The current LegacyImporter/absorb tools don't generate complex logic bodies yet.
      for (const stmt of handler.body) {
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
           // Basic serialization for method calls (e.g., used in codebase-tools logic edges)
           const callee = stmt.expression.callee.type === 'Identifier' ? stmt.expression.callee.name : 'call';
           lines.push(`      ${callee}();`);
        } else {
           // For simplicity in this migration, fallback to a comment or generic representation
           lines.push(`      // unsupported statement: ${stmt.type}`);
        }
      }
      lines.push(`    }`);
    }
    lines.push(`  }`);
  }

  lines.push(`}`);
  return lines.join('\n');
}

function emitObject(obj: HoloObjectDecl, lines: string[], indentLevel: number) {
  const ind = ' '.repeat(indentLevel);
  lines.push(`${ind}object "${escapeString(obj.name)}" {`);

  // Emit traits INSIDE the body (one per line) — matches the canonical
  // .holo source style used by the benchmark fixtures and avoids the
  // header-form `@decorator {` ambiguity where the parser treats `{` as
  // a block-trait-config and consumes the object body. See
  // packages/core/src/parser/HoloCompositionParser.ts parseObject (around
  // the `parseBlockTraitConfig()` branch) for the disambiguation rule.
  for (const trait of obj.traits) {
    lines.push(`${ind}  ${emitTrait(trait)}`);
  }

  for (const prop of obj.properties) {
    lines.push(`${ind}  ${prop.key}: ${emitValue(prop.value)}`);
  }

  if (obj.children) {
    for (const child of obj.children) {
      emitObject(child, lines, indentLevel + 2);
    }
  }

  lines.push(`${ind}}`);
}

function emitTrait(trait: HoloObjectTrait): string {
  let res = trait.name;
  if (!res.startsWith('@')) res = '@' + res;

  const entries = Object.entries(trait.config);
  if (entries.length > 0) {
     const args = entries.map(([k, v]) => `${k}: ${emitValue(v)}`);
     res += `(${args.join(', ')})`;
  } else if (trait.args && trait.args.length > 0) {
     const args = trait.args.map(v => emitValue(v));
     res += `(${args.join(', ')})`;
  }
  return res;
}

function emitValue(val: HoloValue): string {
  if (typeof val === 'string') return `"${escapeString(val)}"`;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  if (val === null) return 'null';
  if (Array.isArray(val)) {
    return `[${val.map(emitValue).join(', ')}]`;
  }
  // Object
  const entries = Object.entries(val as Record<string, HoloValue>);
  const props = entries.map(([k, v]) => `${k}: ${emitValue(v)}`);
  return `{ ${props.join(', ')} }`;
}

function escapeString(s: string): string {
  return s.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
}
