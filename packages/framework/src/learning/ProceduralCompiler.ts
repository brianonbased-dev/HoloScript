export interface ProceduralSkill {
  id: string;
  name: string;
  description?: string;
  /** Raw LLM-authored pseudo-code or HoloScript-like lines to scaffold. */
  code?: string;
}

/**
 * ProceduralCompiler - raw LLM-code safety-wrapper scaffold.
 *
 * This MVP does not expand grammars, noise fields, L-systems, rules, or
 * procedural parameters. It preserves `skill.code` lines inside an agent
 * behavior block and wraps potentially risky primitives with ensure_safety().
 */
export class ProceduralCompiler {
  /**
   * Translates a raw skill-code string into a safety-wrapped agent scaffold.
   */
  static compile(skill: ProceduralSkill): string {
    let compiled = `// Auto-generated safety-wrapped skill scaffold: ${skill.name}\n`;
    compiled += `// Source: raw skill.code lines; no procedural grammar expansion\n`;
    compiled += `// Desc: ${(skill as unknown as { description?: string }).description || 'N/A'}\n\n`;

    compiled += `agent ${skill.id.replace(/-/g, '_')} {\n`;

    // Generate behavior node
    compiled += `  behavior execute() {\n`;

    const codeBlock = (skill as unknown as { code?: string }).code || '';

    // MVP: The LLM outputs pseudo-code or raw JS/HoloScript lines directly in string.
    // This scaffold preserves those lines and adds safety wrappers; it is not
    // a rule/grammar/noise/parameter procedural generator.
    const parsedLines = codeBlock.split('\n');

    for (let line of parsedLines) {
      line = line.trim();
      if (!line) continue;

      // Map some logical conversions if needed, here we just enforce safety wrappers
      if (line.includes('move(') || line.includes('attack(') || line.includes('craft(')) {
        compiled += `    ensure_safety() {\n      ${line}\n    }\n`;
      } else {
        compiled += `    ${line}\n`;
      }
    }

    compiled += `  }\n`;
    compiled += `}\n`;

    return compiled;
  }
}
