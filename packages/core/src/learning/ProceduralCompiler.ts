import { ProceduralSkill } from '../types';

/**
 * ProceduralCompiler
 *
 * Takes JSON-based AI logic trees extracted from temporal LLM generation natively
 * and compiles them strictly down into raw executable `.holo` syntax bounds.
 */
export class ProceduralCompiler {
  /**
   * Translates an Abstract Skill representation into native text executing within the VM.
   */
  static compile(skill: ProceduralSkill): string {
    let compiled = `// Auto-generated skill: ${skill.name}\n`;
    compiled += `// Desc: ${skill.description || 'N/A'}\n\n`;

    compiled += `agent ${skill.id.replace(/-/g, '_')} {\n`;

    // Generate behavior node
    compiled += `  behavior execute() {\n`;

    const codeBlock = skill.code || '';

    // MVP: The LLM outputs pseudo-code or raw JS/HoloScript lines directly in string
    // The procedural compiler validates and formats the raw string cleanly
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
