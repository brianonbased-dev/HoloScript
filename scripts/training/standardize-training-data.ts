import fs from 'fs';

const inputFile =
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training/brittney-v4-cloud-training-final.jsonl';
const outputFile =
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training/cloud-training-redeemed.jsonl';

function standardizeHoloScript(code: string): string {
  if (!code) return code;

  // 1. Initial cleanup (keywords and hooks)
  let s = code
    .replace(/\bclass\b\s+([a-zA-Z_]\w*)/g, 'object "$1"')
    .replace(/\binterface\b\s+([a-zA-Z_]\w*)/g, 'object "$1"')
    .replace(/\bpublic\b|\bprivate\b|\bprotected\b/g, '')
    .replace(/^\s*action\s+(?=[a-zA-Z_])/gm, 'function ')
    .replace(/\b(ability|zone|portal|pattern|effect|algorithm)\s+(?!:)/g, 'object ')

    // --- CLOUD REDEMPTION RULES ---
    .replace(/\|\|/g, ' or ')
    .replace(/&&/g, ' and ')
    .replace(/!(\w+)/g, 'not $1')
    .replace(/\s+==\s+/g, ' is ')
    .replace(/\s+!=\s+/g, ' isnt ')
    .replace(/this\.(\w+)/g, 'this $1')
    .replace(/(\w+)\.(\w+)\((.*?)\)/g, '$1.$2($3)') // Ensure dot notation preserves parens
    //.replace(/(\w+)\.(\w+)/g, '$1 $2') // REMOVED: Don't strip dot
    //.replace(/function\s+(\w+)\((.*?)\)/g, ...) // REMOVED: Don't strip parens from defs
    // -----------------------------

    // 2. Syntax Transformation (Targeting JS-Object style HoloScript)
    // Restore standard operators (Parser supports &&, ||, !, this.prop)
    .replace(/ or /g, ' || ')
    .replace(/ and /g, ' && ')
    .replace(/not /g, '!')
    .replace(/ is /g, ' == ')
    .replace(/ isnt /g, ' != ')
    .replace(/this\s+(\w+)/g, 'this.$1')

    // Convert Node definitions (add space before brace if needed)
    .replace(/class\s+(\w+)/g, 'object "$1"')
    .replace(/interface\s+(\w+)/g, 'object "$1"')
    .replace(/composition\s+"([^"]+)"/g, 'object "$1"') // Simplify composition to object
    .replace(/template\s+"([^"]+)"/g, 'object "$1"') // Simplify template to object

    // Match 'state {', 'logic {', 'stats {', 'visual {', 'audio {' with indentation
    .replace(/^\s*(state|stats|logic|visual|audio|physics|ai|events)\s*{/gm, (match) =>
      match.replace('{', ': {')
    )

    // Convert Methods:
    // Handle "action name(args) {" OR "function name(args) {"
    // Also handle "function name args {" (legacy stripped format if any remains)
    .replace(/^\s*(?:action|function)\s+(\w+)\s*\((.*?)\)\s*{/gm, '$1: ($2) => {')
    .replace(/^\s*(?:action|function)\s+(\w+)\s+([^{]+)\s*{/gm, '$1: ($2) => {') // Handle stripped parens

    // Convert Simple Properties: key value -> key: value
    // Avoid matching "object", "return", "if", "for", etc.
    .replace(
      /^\s*(?!object|return|if|for|while|switch|catch|spawn|function|action)([\w]+)\s+([^:{\n]+)$/gm,
      (match, key, val) => {
        if (/^(".+"|\d+|true|false|null|this\..+)$/.test(val.trim())) {
          return `${match.split(/\s+/)[0]}: ${val.trim()},`;
        }
        return match;
      }
    )

    // Add trailing commas to closing braces (heuristic)
    .replace(/}\s*$/gm, '},')

    // Clean up
    .replace(/;$/gm, ',')
    .replace(/,+/g, ',')
    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing comma before closing brace

    // Fix logic wrapper (handle indentation and potential missing colon if regex missed)
    .replace(/^\s*logic\s*:?\s*{/gm, (m) => m.replace(/logic\s*:?/, 'behaviors:'))

    .replace(/^\s*\belse\s+if\b\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm, '@else @if $2 {')
    .replace(/^\s*\belse\b\s*{\s*(?:\/\/.*)?$/gm, '@else {')

    // Handle one-line if statements: if (cond) return -> @if cond { return }
    .replace(/^\s*\bif\b\s*\((.*?)\)\s*(return|break|continue|throw)(.*)$/gm, '@if $1 { $2$3 }')

    // Handle standard if blocks: if (cond) { -> @if cond {
    .replace(/^\s*\b(if|for|while|forEach)\b\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm, '@$1 $2 {')

    .replace(
      /^\s*(?!@|return|if|for|while|switch|catch)(\w+)\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm,
      'function $1 {'
    )
    .replace(/(\w+)\s*:\s*function\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm, 'function $1 {')
    .replace(/(\w+)\s*:\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm, 'function $1 {')
    .replace(/(\w+)\s*:\s*\(.*?\)\s*=>\s*{\s*(?:\/\/.*)?$/gm, 'function $1 {')
    .replace(/\b(void|bool|int|string|float|number|any|List<.*?>)\s+function\s+/g, 'function ')
    .replace(/<.*?>/g, '')
    .replace(/object\s+"([^"]+)"\s+extends\s+\w+/g, 'object "$1"')
    .replace(/(\w+)\s*:\s*(\w+)\s*=([\s\S]*?);?$/gm, '$1: $3')
    .replace(/(\w+)\s*=\s*new\s+(\w+)\s*\(.*?\)/g, 'spawn "$2"')

    // Generic function calls (must be after definitions)
    // Avoid matching @if ... which might look like a call if regex is sloppy
    // Also handling max(0, 1) -> max 0, 1
    .replace(/(\w+)\s*\((.*?)\)/g, (match, p1, p2) => {
      if (p1 === 'if' || p1 === 'for' || p1 === 'while' || p1 === 'function') return match;
      return p2.trim() ? `${p1} ${p2.trim()}` : p1;
    })
    .replace(/^(\s*)@?on_(?!entry|exit)([\w_]+)/gm, '$1@on_$2')
    .replace(/:\s*(\w+)\s*\|/g, ': "$1" |')
    .replace(/:(\s*)"([^"]+)"(\s*\|(\s*)"([^"]+)")+/g, ':$1"$2"')
    .replace(/\},/g, '}')
    .replace(/\],/g, ']')
    .replace(/,(\s*[\}\]])/g, '$1')
    .replace(/;$/gm, '')
    .replace(/^(\s*)npc\b/gm, '$1npc');

  s = s
    .split('\n')
    .map((line) => {
      // Add commas to properties inside blocks if missing
      if (/^\s*[\w]+\s*:\s*.+[^,{[]$/.test(line)) {
        return line + ',';
      }
      return line;
    })
    .join('\n');

  const lines = s.split('\n');
  const result: string[] = [];

  let depth = 0;
  let logicStartedAtDepth: number | null = null;
  let inNode = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push(line);
      continue;
    }

    const indent = line.substring(0, line.indexOf(trimmed));
    const isClosing = trimmed.startsWith('}');
    const isOpening = trimmed.endsWith('{');

    // Identify behavior to wrap (only if inside a node container)
    const isBehavior =
      /^\s*(function|let|const|if|for|while|return|wait|emit|play_sound|spawn_particles|this\.)/.test(
        line
      );
    const isBareAssignment = /^\s*[\w_.]+\s*=\s*[^:{]+$/.test(line);

    if (
      inNode &&
      (isBehavior || isBareAssignment) &&
      !trimmed.startsWith('@') &&
      !trimmed.startsWith('logic')
    ) {
      if (logicStartedAtDepth === null) {
        result.push(`${indent}logic {`);
        logicStartedAtDepth = depth;
      }
    }

    if (isClosing) {
      depth--;
      // If we were in logic, and this brace brings us back to where logic started, close logic FIRST
      if (logicStartedAtDepth !== null && depth < logicStartedAtDepth) {
        const logicIndent = ' '.repeat(Math.max(0, (logicStartedAtDepth - 1) * 2)); // Best guess at indent
        result.push(`${logicIndent}  }`);
        logicStartedAtDepth = null;
      }
    }

    // Apply extra indent if inside injected logic
    let processedLine = logicStartedAtDepth !== null ? `  ${line}` : line;
    result.push(processedLine);

    if (isOpening) {
      const isNode = /^\s*(system|composition|world|object|template|state_machine|state)\b/.test(
        line
      );
      if (isNode) inNode = true;
      depth++;
    }

    if (depth === 0) inNode = false;
  }

  // Close any unclosed logic
  if (logicStartedAtDepth !== null) {
    result.push('  }');
  }

  return result.join('\n');
}

try {
  const raw = fs.readFileSync(inputFile, 'utf8');
  const entries = raw.split('\n').filter((l) => l.trim());
  const processed = entries
    .map((l, i) => {
      try {
        const j = JSON.parse(l);
        let code = '';
        let isMessages = false;

        if (j.messages && Array.isArray(j.messages)) {
          // OpenAI Messages
          isMessages = true;
          const assistantMsg = j.messages.find((m: any) => m.role === 'assistant');
          if (assistantMsg) code = assistantMsg.content;
        } else {
          code = j.completion || j.output || '';
        }

        const cleanCode = standardizeHoloScript(code);

        if (isMessages) {
          const assistantMsg = j.messages.find((m: any) => m.role === 'assistant');
          if (assistantMsg) assistantMsg.content = cleanCode;
        } else {
          j.completion = cleanCode;
        }
        return JSON.stringify(j);
      } catch (e) {
        return l;
      }
    })
    .join('\n');

  fs.writeFileSync(outputFile, processed, 'utf8');
  console.log('Successfully standardized all entries.');
} catch (e) {
  console.error(e);
}
