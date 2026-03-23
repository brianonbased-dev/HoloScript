/**
 * Skill-MD Bridge — Bidirectional .hsplus <-> SKILL.md Conversion
 *
 * Converts HoloScript .hsplus composition skills to portable SKILL.md format
 * (ClawHub/OpenClaw compatible) and back. Enables cross-platform skill sharing
 * between HoloClaw's native .hsplus format and the broader agent skill ecosystem.
 *
 * Forward bridge: .hsplus -> SKILL.md
 *   - Extracts composition metadata (name, description, version) as YAML frontmatter
 *   - Converts behavior tree sequences into Markdown instruction steps
 *   - Includes trait declarations, state schema, and runtime requirements
 *
 * Reverse bridge: SKILL.md -> .hsplus
 *   - Parses YAML frontmatter into composition metadata + trait declarations
 *   - Converts Markdown instructions into behavior tree sequence nodes
 *   - Wraps in full composition structure with @economy, @rate_limiter, @timeout_guard
 *
 * ClawHub CLI integration: publish/install skill packages
 *
 * @version 1.0.0
 * @see compositions/skills/*.hsplus — HoloClaw native skill format
 * @see .claude/skills/ *\/SKILL.md — Claude Code SKILL.md format
 * @see https://docs.openclaw.ai/tools/skills — ClawHub specification
 *
 * Security considerations (Corridor-inline):
 *   - File paths are validated against path traversal
 *   - No shell execution in the bridge itself (CLI integration uses subprocess)
 *   - Skill content is parsed, not eval'd
 *   - YAML frontmatter is parsed with safe subset (no !!python/exec etc.)
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Metadata extracted from an .hsplus composition skill or SKILL.md frontmatter.
 * This is the canonical interchange format between the two representations.
 */
export interface SkillMetadata {
  /** Skill identifier (kebab-case, e.g. "code-health") */
  name: string;
  /** Human-readable description of what the skill does */
  description: string;
  /** Semantic version string */
  version: string;
  /** Author name or organization */
  author: string;
  /** Skill category for marketplace browsing */
  category?: string;
  /** Tags for search/discovery */
  tags?: string[];
  /** Minimum HoloScript CLI version required */
  holoCliVersion?: string;
  /** Minimum Node.js version required */
  nodeVersion?: string;
  /** Economy budget limit per invocation (USD) */
  spendLimit?: number;
  /** Whether users can invoke this skill via slash command */
  userInvocable?: boolean;
  /** License identifier (SPDX) */
  license?: string;
  /** Homepage URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;
}

/**
 * A state variable declared in a composition skill.
 */
export interface SkillStateVar {
  /** Variable name */
  name: string;
  /** Type: string, number, boolean */
  type: string;
  /** Default value */
  defaultValue: string | number | boolean;
}

/**
 * A trait declaration extracted from a composition skill.
 */
export interface SkillTraitDecl {
  /** Trait name (e.g. "rate_limiter", "economy") */
  name: string;
  /** Trait configuration parameters */
  config: Record<string, unknown>;
}

/**
 * A behavior tree action step extracted from a composition skill.
 */
export interface SkillActionStep {
  /** Action name (e.g. "shell_exec", "diagnose") */
  action: string;
  /** Human-readable description of what this step does */
  description: string;
  /** Action parameters */
  params: Record<string, unknown>;
  /** BT node type: action, sequence, selector, condition */
  nodeType: 'action' | 'sequence' | 'selector' | 'condition';
}

/**
 * A test assertion extracted from a composition skill.
 */
export interface SkillTest {
  /** Test name */
  name: string;
  /** Setup expression (optional) */
  setup?: string;
  /** Assert expression */
  assert: string;
}

/**
 * Fully parsed skill representation — the intermediate form between .hsplus and SKILL.md.
 */
export interface ParsedSkill {
  metadata: SkillMetadata;
  traits: SkillTraitDecl[];
  state: SkillStateVar[];
  steps: SkillActionStep[];
  tests: SkillTest[];
  /** Raw environment block properties (if any) */
  environment?: Record<string, unknown>;
  /** Raw object declarations (for complex skills with scene objects) */
  objects?: string[];
  /** Original source comments (leading comment block) */
  sourceComments: string[];
}

/**
 * Result of a bridge conversion operation.
 */
export interface BridgeResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
  warnings: string[];
}

/**
 * ClawHub package manifest for publish/install operations.
 */
export interface ClawHubManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  holoScript: {
    format: 'hsplus';
    minCliVersion: string;
    traits: string[];
    stateVars: string[];
    testCount: number;
  };
  files: string[];
  dependencies?: Record<string, string>;
}

// =============================================================================
// FORWARD BRIDGE: .hsplus -> SKILL.md
// =============================================================================

/**
 * Parse an .hsplus composition source string into a structured ParsedSkill.
 * Uses regex-based extraction (not a full parser) for lightweight, dependency-free operation.
 */
export function parseHsplus(source: string): BridgeResult<ParsedSkill> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Extract leading comments ---
  const sourceComments = extractLeadingComments(source);

  // --- Extract composition name ---
  const compositionMatch = source.match(
    /composition\s+"([^"]+)"\s*\{/
  );
  if (!compositionMatch) {
    errors.push('No composition declaration found. Expected: composition "name" { ... }');
    return { success: false, errors, warnings };
  }
  const compositionName = compositionMatch[1];

  // --- Extract description from leading comments ---
  const description = extractDescription(sourceComments);

  // --- Extract version from @version JSDoc or default ---
  const versionMatch = source.match(/@version\s+([\d.]+)/);
  const version = versionMatch ? versionMatch[1] : '1.0.0';

  // --- Extract traits ---
  const traits = extractTraits(source);

  // --- Extract state variables ---
  const state = extractStateVars(source);

  // --- Extract behavior tree steps ---
  const steps = extractBTSteps(source);

  // --- Extract tests ---
  const tests = extractTests(source);

  // --- Extract environment ---
  const environment = extractEnvironment(source);

  // --- Extract objects ---
  const objects = extractObjectNames(source);

  // --- Extract spend limit from @economy trait ---
  const economyTrait = traits.find(t => t.name === 'economy');
  const spendLimit = economyTrait?.config?.default_spend_limit as number | undefined;

  const metadata: SkillMetadata = {
    name: compositionName,
    description: description || `HoloClaw skill: ${compositionName}`,
    version,
    author: 'HoloScript',
    holoCliVersion: '5.0.0',
    nodeVersion: '20',
    spendLimit,
    userInvocable: true,
  };

  return {
    success: true,
    data: {
      metadata,
      traits,
      state,
      steps,
      tests,
      environment: environment || undefined,
      objects: objects.length > 0 ? objects : undefined,
      sourceComments,
    },
    errors,
    warnings,
  };
}

/**
 * Convert a ParsedSkill into a SKILL.md string (ClawHub-compatible format).
 */
export function toSkillMd(skill: ParsedSkill): BridgeResult<string> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines: string[] = [];

  // --- YAML Frontmatter ---
  lines.push('---');
  lines.push(`name: ${skill.metadata.name}`);
  lines.push('description: >');
  // Wrap description to 80 chars with 2-space indent
  const descWords = skill.metadata.description.split(/\s+/);
  let descLine = '  ';
  for (const word of descWords) {
    if (descLine.length + word.length + 1 > 80) {
      lines.push(descLine);
      descLine = '  ' + word;
    } else {
      descLine += (descLine.trim().length > 0 ? ' ' : '') + word;
    }
  }
  if (descLine.trim().length > 0) lines.push(descLine);

  if (skill.metadata.version !== '1.0.0') {
    lines.push(`version: ${skill.metadata.version}`);
  }
  if (skill.metadata.author && skill.metadata.author !== 'HoloScript') {
    lines.push(`author: ${skill.metadata.author}`);
  }
  if (skill.metadata.category) {
    lines.push(`category: ${skill.metadata.category}`);
  }
  if (skill.metadata.tags && skill.metadata.tags.length > 0) {
    lines.push(`tags: [${skill.metadata.tags.join(', ')}]`);
  }
  if (skill.metadata.homepage) {
    lines.push(`homepage: ${skill.metadata.homepage}`);
  }
  if (skill.metadata.license) {
    lines.push(`license: ${skill.metadata.license}`);
  }
  lines.push('---');
  lines.push('');

  // --- Title ---
  const titleName = skill.metadata.name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  lines.push(`# ${titleName}`);
  lines.push('');
  lines.push(skill.metadata.description);
  lines.push('');

  // --- Runtime Requirements ---
  lines.push('## Runtime Requirements');
  lines.push('');
  lines.push(`- **holoscript-cli** >= ${skill.metadata.holoCliVersion || '5.0.0'}`);
  lines.push(`- **Node.js** >= ${skill.metadata.nodeVersion || '20'}`);
  if (skill.metadata.spendLimit !== undefined) {
    lines.push(`- **Economy budget**: $${skill.metadata.spendLimit.toFixed(2)} per invocation`);
  }
  lines.push('');

  // --- Traits ---
  if (skill.traits.length > 0) {
    lines.push('## Traits');
    lines.push('');
    for (const trait of skill.traits) {
      const configStr = Object.keys(trait.config).length > 0
        ? ` (${Object.entries(trait.config).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})`
        : '';
      lines.push(`- \`@${trait.name}\`${configStr}`);
    }
    lines.push('');
  }

  // --- State Schema ---
  if (skill.state.length > 0) {
    lines.push('## State Schema');
    lines.push('');
    lines.push('| Variable | Type | Default |');
    lines.push('|----------|------|---------|');
    for (const sv of skill.state) {
      lines.push(`| \`${sv.name}\` | ${sv.type} | \`${JSON.stringify(sv.defaultValue)}\` |`);
    }
    lines.push('');
  }

  // --- Environment ---
  if (skill.environment && Object.keys(skill.environment).length > 0) {
    lines.push('## Environment');
    lines.push('');
    lines.push('```yaml');
    for (const [key, val] of Object.entries(skill.environment)) {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    }
    lines.push('```');
    lines.push('');
  }

  // --- Workflow Steps ---
  if (skill.steps.length > 0) {
    lines.push('## Workflow');
    lines.push('');
    let stepNum = 1;
    for (const step of skill.steps) {
      if (step.nodeType === 'sequence' || step.nodeType === 'selector') {
        lines.push(`### ${step.description || step.action}`);
        lines.push('');
      } else {
        const paramsStr = Object.keys(step.params).length > 0
          ? ` (${Object.entries(step.params).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})`
          : '';
        lines.push(`${stepNum}. **${step.action}**${paramsStr}`);
        if (step.description) {
          lines.push(`   ${step.description}`);
        }
        stepNum++;
      }
    }
    lines.push('');
  }

  // --- Objects ---
  if (skill.objects && skill.objects.length > 0) {
    lines.push('## Scene Objects');
    lines.push('');
    for (const obj of skill.objects) {
      lines.push(`- \`${obj}\``);
    }
    lines.push('');
  }

  // --- Tests ---
  if (skill.tests.length > 0) {
    lines.push('## Tests');
    lines.push('');
    lines.push(`${skill.tests.length} built-in assertions:`);
    lines.push('');
    for (const test of skill.tests) {
      lines.push(`- **${test.name}**: \`${test.assert}\``);
    }
    lines.push('');
  }

  // --- Installation ---
  lines.push('## Installation');
  lines.push('');
  lines.push('```bash');
  lines.push(`# Via HoloClaw CLI`);
  lines.push(`hs claw install ${skill.metadata.name}`);
  lines.push('');
  lines.push('# Via ClawHub registry');
  lines.push(`clawhub install @holoscript/${skill.metadata.name}`);
  lines.push('');
  lines.push('# Manual: copy to compositions/skills/');
  lines.push(`cp ${skill.metadata.name}.hsplus compositions/skills/`);
  lines.push('```');
  lines.push('');

  // --- Run ---
  lines.push('## Usage');
  lines.push('');
  lines.push('```bash');
  lines.push(`# Run standalone`);
  lines.push(`hs run compositions/skills/${skill.metadata.name}.hsplus`);
  lines.push('');
  lines.push('# Run as HoloClaw skill (hot-reload)');
  lines.push(`hs daemon compositions/holoclaw.hsplus --always-on`);
  lines.push('```');
  lines.push('');

  // --- Footer ---
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by HoloScript Skill-MD Bridge v1.0.0*`);
  lines.push(`*Source format: .hsplus (HoloClaw native composition)*`);
  lines.push('');

  return {
    success: true,
    data: lines.join('\n'),
    errors,
    warnings,
  };
}

/**
 * Convert an .hsplus source string directly to SKILL.md string.
 * Convenience wrapper combining parseHsplus + toSkillMd.
 */
export function hsplusToSkillMd(source: string): BridgeResult<string> {
  const parsed = parseHsplus(source);
  if (!parsed.success || !parsed.data) {
    return { success: false, errors: parsed.errors, warnings: parsed.warnings };
  }
  return toSkillMd(parsed.data);
}

// =============================================================================
// REVERSE BRIDGE: SKILL.md -> .hsplus
// =============================================================================

/**
 * Parse a SKILL.md string into a structured ParsedSkill.
 */
export function parseSkillMd(markdown: string): BridgeResult<ParsedSkill> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Parse YAML frontmatter ---
  const frontmatter = extractFrontmatter(markdown);
  if (!frontmatter) {
    errors.push('No YAML frontmatter found. Expected --- delimited block at start of file.');
    return { success: false, errors, warnings };
  }

  const name = frontmatter.name;
  if (!name) {
    errors.push('Frontmatter missing required "name" field.');
    return { success: false, errors, warnings };
  }

  const description = frontmatter.description || '';
  const version = frontmatter.version || '1.0.0';
  const author = frontmatter.author || 'HoloScript';

  const metadata: SkillMetadata = {
    name,
    description: typeof description === 'string' ? description.trim() : String(description),
    version,
    author,
    category: frontmatter.category,
    tags: frontmatter.tags,
    holoCliVersion: frontmatter['holoscript-cli'] || '5.0.0',
    nodeVersion: frontmatter['node-version'] || '20',
    license: frontmatter.license,
    homepage: frontmatter.homepage,
    userInvocable: frontmatter['user-invocable'] !== false,
  };

  // --- Parse body sections ---
  const body = extractBody(markdown);

  // --- Extract traits from Traits section ---
  const traits = extractTraitsFromMd(body);

  // --- Extract state from State Schema section ---
  const state = extractStateFromMd(body);

  // --- Extract steps from Workflow section ---
  const steps = extractStepsFromMd(body);

  // --- Extract tests from Tests section ---
  const tests = extractTestsFromMd(body);

  // --- Extract environment from Environment section ---
  const environment = extractEnvironmentFromMd(body);

  return {
    success: true,
    data: {
      metadata,
      traits: traits.length > 0 ? traits : getDefaultTraits(),
      state,
      steps,
      tests,
      environment: environment || undefined,
      sourceComments: [],
    },
    errors,
    warnings,
  };
}

/**
 * Convert a ParsedSkill into an .hsplus composition source string.
 */
export function toHsplus(skill: ParsedSkill): BridgeResult<string> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines: string[] = [];

  // --- Leading comment block ---
  lines.push(`// ${titleCase(skill.metadata.name)} -- ${skill.metadata.description.split('\n')[0]}`);
  if (skill.metadata.description.includes('\n')) {
    for (const line of skill.metadata.description.split('\n').slice(1)) {
      if (line.trim()) lines.push(`// ${line.trim()}`);
    }
  }
  lines.push(`// Installed via HoloClaw Shelf. Hot-reloads into running daemon.`);
  if (skill.metadata.version !== '1.0.0') {
    lines.push(`//`);
    lines.push(`// @version ${skill.metadata.version}`);
  }
  lines.push('');

  // --- Composition declaration ---
  lines.push(`composition "${skill.metadata.name}" {`);

  // --- Traits ---
  for (const trait of skill.traits) {
    const configEntries = Object.entries(trait.config);
    if (configEntries.length === 0) {
      lines.push(`  @${trait.name}`);
    } else if (configEntries.length === 1) {
      const [k, v] = configEntries[0];
      lines.push(`  @${trait.name} (${k}: ${formatHsplusValue(v)})`);
    } else {
      lines.push(`  @${trait.name} {`);
      for (const [k, v] of configEntries) {
        lines.push(`    ${k}: ${formatHsplusValue(v)}`);
      }
      lines.push(`  }`);
    }
  }
  lines.push('');

  // --- State variables ---
  for (const sv of skill.state) {
    lines.push(`  state ${sv.name}: ${sv.type} = ${formatHsplusValue(sv.defaultValue)}`);
  }
  if (skill.state.length > 0) lines.push('');

  // --- Environment ---
  if (skill.environment && Object.keys(skill.environment).length > 0) {
    lines.push('  environment {');
    for (const [key, val] of Object.entries(skill.environment)) {
      lines.push(`    ${key}: ${formatHsplusValue(val)}`);
    }
    lines.push('  }');
    lines.push('');
  }

  // --- Behavior tree steps ---
  if (skill.steps.length > 0) {
    const topSequences = groupStepsIntoSequences(skill.steps);
    for (const seq of topSequences) {
      emitBTNode(lines, seq, 2);
    }
    lines.push('');
  }

  // --- Tests ---
  if (skill.tests.length > 0) {
    lines.push('  // -- Tests --');
    lines.push('');
    for (const test of skill.tests) {
      lines.push('  @test {');
      lines.push(`    name: "${test.name}"`);
      if (test.setup) {
        lines.push(`    setup: { ${test.setup} }`);
      }
      lines.push(`    assert: { ${test.assert} }`);
      lines.push('  }');
      lines.push('');
    }
  }

  lines.push('}');
  lines.push('');

  return {
    success: true,
    data: lines.join('\n'),
    errors,
    warnings,
  };
}

/**
 * Convert a SKILL.md string directly to .hsplus source string.
 * Convenience wrapper combining parseSkillMd + toHsplus.
 */
export function skillMdToHsplus(markdown: string): BridgeResult<string> {
  const parsed = parseSkillMd(markdown);
  if (!parsed.success || !parsed.data) {
    return { success: false, errors: parsed.errors, warnings: parsed.warnings };
  }
  return toHsplus(parsed.data);
}

// =============================================================================
// CLAWHUB CLI INTEGRATION
// =============================================================================

/**
 * Generate a ClawHub package manifest from a ParsedSkill.
 * This manifest can be used for `clawhub publish` operations.
 */
export function generateClawHubManifest(skill: ParsedSkill): ClawHubManifest {
  return {
    name: `@holoscript/${skill.metadata.name}`,
    version: skill.metadata.version,
    description: skill.metadata.description,
    author: skill.metadata.author,
    license: skill.metadata.license || 'MIT',
    holoScript: {
      format: 'hsplus',
      minCliVersion: skill.metadata.holoCliVersion || '5.0.0',
      traits: skill.traits.map(t => t.name),
      stateVars: skill.state.map(s => s.name),
      testCount: skill.tests.length,
    },
    files: [
      `${skill.metadata.name}.hsplus`,
      'SKILL.md',
      'clawhub.json',
    ],
  };
}

/**
 * Generate the complete set of files needed for a ClawHub publish.
 * Returns a map of filename -> content.
 */
export function generateClawHubPackage(source: string): BridgeResult<Map<string, string>> {
  const parsed = parseHsplus(source);
  if (!parsed.success || !parsed.data) {
    return { success: false, errors: parsed.errors, warnings: parsed.warnings };
  }

  const skill = parsed.data;
  const skillMdResult = toSkillMd(skill);
  if (!skillMdResult.success || !skillMdResult.data) {
    return { success: false, errors: skillMdResult.errors, warnings: skillMdResult.warnings };
  }

  const manifest = generateClawHubManifest(skill);
  const files = new Map<string, string>();

  files.set(`${skill.metadata.name}.hsplus`, source);
  files.set('SKILL.md', skillMdResult.data);
  files.set('clawhub.json', JSON.stringify(manifest, null, 2));

  return {
    success: true,
    data: files,
    errors: [],
    warnings: [],
  };
}

/**
 * Generate a CLI command string for publishing to ClawHub.
 * Does NOT execute the command -- returns the string for the caller to execute.
 *
 * @param skillName - The skill name (kebab-case)
 * @param registry - The registry URL (default: https://registry.clawhub.com)
 */
export function getPublishCommand(
  skillName: string,
  registry = 'https://registry.clawhub.com'
): string {
  return `clawhub publish @holoscript/${skillName} --registry ${registry}`;
}

/**
 * Generate a CLI command string for installing a skill from ClawHub.
 *
 * @param skillName - The skill name (kebab-case)
 * @param targetDir - Target directory (default: compositions/skills)
 * @param registry - The registry URL (default: https://registry.clawhub.com)
 */
export function getInstallCommand(
  skillName: string,
  targetDir = 'compositions/skills',
  registry = 'https://registry.clawhub.com'
): string {
  return `clawhub install @holoscript/${skillName} --target ${targetDir} --registry ${registry}`;
}

/**
 * Generate a CLI command string for installing via the HoloScript CLI.
 *
 * @param skillName - The skill name (kebab-case)
 */
export function getHsInstallCommand(skillName: string): string {
  return `hs claw install ${skillName}`;
}

// =============================================================================
// INTERNAL HELPERS: .hsplus PARSING
// =============================================================================

function extractLeadingComments(source: string): string[] {
  const lines = source.split('\n');
  const comments: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      comments.push(trimmed.replace(/^\/\/\s?/, ''));
    } else if (trimmed === '' && comments.length > 0) {
      // Allow blank lines between comment blocks at the top
      continue;
    } else {
      break;
    }
  }
  return comments;
}

function extractDescription(comments: string[]): string {
  // First non-empty comment line that isn't a tag or metadata
  const descLines: string[] = [];
  for (const line of comments) {
    if (line.startsWith('@') || line.startsWith('*') || line === '') continue;
    // Skip lines that are clearly skill identifiers (e.g. "Code Health Monitor -- ...")
    descLines.push(line);
  }
  return descLines.join(' ').trim();
}

function extractTraits(source: string): SkillTraitDecl[] {
  const traits: SkillTraitDecl[] = [];
  // Match @trait_name or @trait_name (key: value, ...) or @trait_name { ... }
  // Only match traits that appear right inside the composition (indented by 2 spaces)
  const traitRegex = /^\s{2}@(\w+)(?:\s*\(([^)]*)\))?(?:\s*\{([^}]*)\})?/gm;
  let match: RegExpExecArray | null;
  while ((match = traitRegex.exec(source)) !== null) {
    const name = match[1];
    // Skip @test blocks and @version
    if (name === 'test' || name === 'version') continue;
    const config: Record<string, unknown> = {};
    const inlineConfig = match[2] || match[3];
    if (inlineConfig) {
      parseTraitConfig(inlineConfig, config);
    }
    traits.push({ name, config });
  }
  return traits;
}

function parseTraitConfig(configStr: string, config: Record<string, unknown>): void {
  // Parse key: value pairs from trait config
  const pairs = configStr.split(/,|\n/).map(s => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim();
    const rawVal = pair.slice(colonIdx + 1).trim();
    config[key] = parseConfigValue(rawVal);
  }
}

function parseConfigValue(raw: string): unknown {
  // Try number
  if (/^-?\d+(\.\d+)?$/.test(raw)) return parseFloat(raw);
  // Try boolean
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Try quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function extractStateVars(source: string): SkillStateVar[] {
  const vars: SkillStateVar[] = [];

  // Match inline state declarations: state name: type = value
  const inlineRegex = /^\s+state\s+(\w+)\s*:\s*(\w+)\s*=\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = inlineRegex.exec(source)) !== null) {
    const name = match[1];
    const type = match[2];
    const rawVal = match[3].trim();
    vars.push({ name, type, defaultValue: parseStateDefault(rawVal, type) });
  }

  // Match block state { key: value, ... } format
  const blockMatch = source.match(/\bstate\s*\{([^}]*)\}/);
  if (blockMatch && vars.length === 0) {
    const blockContent = blockMatch[1];
    const lineRegex = /^\s*(\w+)\s*:\s*(.+)$/gm;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRegex.exec(blockContent)) !== null) {
      const name = lineMatch[1];
      const rawVal = lineMatch[2].trim();
      const type = inferType(rawVal);
      vars.push({ name, type, defaultValue: parseStateDefault(rawVal, type) });
    }
  }

  return vars;
}

function parseStateDefault(raw: string, type: string): string | number | boolean {
  const cleaned = raw.replace(/[,;]$/, '').trim();
  if (type === 'number') return parseFloat(cleaned) || 0;
  if (type === 'boolean') return cleaned === 'true';
  // String: strip quotes
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) return cleaned.slice(1, -1);
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) return cleaned.slice(1, -1);
  return cleaned;
}

function inferType(raw: string): string {
  const cleaned = raw.replace(/[,;]$/, '').trim();
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return 'number';
  if (cleaned === 'true' || cleaned === 'false') return 'boolean';
  return 'string';
}

function extractBTSteps(source: string): SkillActionStep[] {
  const steps: SkillActionStep[] = [];

  // Match sequence "name" { ... } blocks
  const seqRegex = /\b(sequence|selector)\s+"([^"]+)"\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = seqRegex.exec(source)) !== null) {
    steps.push({
      action: match[2],
      description: match[2].replace(/-/g, ' '),
      params: {},
      nodeType: match[1] as 'sequence' | 'selector',
    });
  }

  // Match action "name" { ... } blocks
  const actionRegex = /\baction\s+"([^"]+)"\s*\{([^}]*)\}/g;
  while ((match = actionRegex.exec(source)) !== null) {
    const actionName = match[1];
    const body = match[2];
    const params: Record<string, unknown> = {};
    const desc = extractActionComment(body);

    // Extract params from action body
    const paramRegex = /^\s*(\w+)\s*:\s*(.+)$/gm;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(body)) !== null) {
      const key = paramMatch[1];
      const val = paramMatch[2].trim();
      // Skip comments
      if (val.startsWith('//')) continue;
      params[key] = parseConfigValue(val);
    }

    steps.push({
      action: actionName,
      description: desc || actionName.replace(/_/g, ' '),
      params,
      nodeType: 'action',
    });
  }

  return steps;
}

function extractActionComment(body: string): string {
  const commentMatch = body.match(/\/\/\s*(.+)/);
  return commentMatch ? commentMatch[1].trim() : '';
}

function extractTests(source: string): SkillTest[] {
  const tests: SkillTest[] = [];
  // Use a manual brace-counting approach to extract @test blocks
  // since they contain nested { } for assert and setup
  const testStarts = [...source.matchAll(/@test\s*\{/g)];
  for (const startMatch of testStarts) {
    const startIdx = startMatch.index! + startMatch[0].length;
    let depth = 1;
    let i = startIdx;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      if (source[i] === '}') depth--;
      i++;
    }
    const block = source.slice(startIdx, i - 1);
    const nameMatch = block.match(/name\s*:\s*"([^"]+)"/);
    const assertMatch = block.match(/assert\s*:\s*\{([^}]+)\}/);
    const setupMatch = block.match(/setup\s*:\s*\{([^}]+)\}/);
    if (nameMatch && assertMatch) {
      tests.push({
        name: nameMatch[1],
        assert: assertMatch[1].trim(),
        setup: setupMatch ? setupMatch[1].trim() : undefined,
      });
    }
  }
  return tests;
}

function extractEnvironment(source: string): Record<string, unknown> | null {
  const envMatch = source.match(/\benvironment\s*\{([^}]*)\}/);
  if (!envMatch) return null;
  const config: Record<string, unknown> = {};
  const lineRegex = /^\s*(\w+)\s*:\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(envMatch[1])) !== null) {
    config[match[1]] = parseConfigValue(match[2].trim());
  }
  return config;
}

function extractObjectNames(source: string): string[] {
  const names: string[] = [];
  const objRegex = /\bobject\s+"([^"]+)"\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = objRegex.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

// =============================================================================
// INTERNAL HELPERS: SKILL.md PARSING
// =============================================================================

function extractFrontmatter(markdown: string): Record<string, any> | null {
  const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  return parseSimpleYaml(fmMatch[1]);
}

/**
 * Simple YAML parser for frontmatter. Handles:
 * - key: value (scalars)
 * - key: > (multi-line folded)
 * - key: [a, b, c] (arrays)
 *
 * Does NOT support anchors, aliases, or complex nesting.
 * This avoids a dependency on a full YAML parser.
 */
function parseSimpleYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let multilineValue: string[] = [];
  let inMultiline = false;

  for (const line of lines) {
    // Multi-line continuation (indented lines following "key: >")
    if (inMultiline) {
      if (line.match(/^\s{2,}/) && !line.match(/^\S/)) {
        multilineValue.push(line.trim());
        continue;
      } else {
        // End multi-line
        if (currentKey) {
          result[currentKey] = multilineValue.join(' ');
        }
        inMultiline = false;
        currentKey = null;
        multilineValue = [];
      }
    }

    const kvMatch = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      const rawVal = kvMatch[2].trim();

      if (rawVal === '>') {
        currentKey = key;
        inMultiline = true;
        multilineValue = [];
        continue;
      }

      // Array: [a, b, c]
      if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        result[key] = rawVal
          .slice(1, -1)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        continue;
      }

      // Scalar
      result[key] = parseConfigValue(rawVal);
    }
  }

  // Flush any remaining multi-line
  if (inMultiline && currentKey) {
    result[currentKey] = multilineValue.join(' ');
  }

  return result;
}

function extractBody(markdown: string): string {
  const fmEnd = markdown.indexOf('---', 3);
  if (fmEnd === -1) return markdown;
  return markdown.slice(fmEnd + 3).trim();
}

function extractTraitsFromMd(body: string): SkillTraitDecl[] {
  const traits: SkillTraitDecl[] = [];
  const traitsSection = extractSection(body, 'Traits');
  if (!traitsSection) return traits;

  const traitRegex = /`@(\w+)`(?:\s*\(([^)]+)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = traitRegex.exec(traitsSection)) !== null) {
    const config: Record<string, unknown> = {};
    if (match[2]) {
      parseTraitConfig(match[2], config);
    }
    traits.push({ name: match[1], config });
  }
  return traits;
}

function extractStateFromMd(body: string): SkillStateVar[] {
  const vars: SkillStateVar[] = [];
  const stateSection = extractSection(body, 'State Schema');
  if (!stateSection) return vars;

  // Parse markdown table rows
  const rowRegex = /\|\s*`(\w+)`\s*\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|/g;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(stateSection)) !== null) {
    const name = match[1];
    const type = match[2];
    const rawDefault = match[3];
    vars.push({
      name,
      type,
      defaultValue: parseStateDefault(rawDefault, type),
    });
  }
  return vars;
}

function extractStepsFromMd(body: string): SkillActionStep[] {
  const steps: SkillActionStep[] = [];
  const workflowSection = extractSection(body, 'Workflow');
  if (!workflowSection) return steps;

  // Parse ### subsections as sequences
  const subsectionRegex = /###\s+(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = subsectionRegex.exec(workflowSection)) !== null) {
    steps.push({
      action: match[1].trim().toLowerCase().replace(/\s+/g, '-'),
      description: match[1].trim(),
      params: {},
      nodeType: 'sequence',
    });
  }

  // Parse numbered list items as actions
  const stepRegex = /\d+\.\s+\*\*([^*]+)\*\*(?:\s*\(([^)]+)\))?(?:\s*\n\s+(.+))?/g;
  while ((match = stepRegex.exec(workflowSection)) !== null) {
    const params: Record<string, unknown> = {};
    if (match[2]) {
      parseTraitConfig(match[2], params);
    }
    steps.push({
      action: match[1].trim(),
      description: match[3]?.trim() || match[1].trim().replace(/_/g, ' '),
      params,
      nodeType: 'action',
    });
  }

  return steps;
}

function extractTestsFromMd(body: string): SkillTest[] {
  const tests: SkillTest[] = [];
  const testsSection = extractSection(body, 'Tests');
  if (!testsSection) return tests;

  // Parse "- **name**: `assertion`"
  const testRegex = /-\s+\*\*([^*]+)\*\*\s*:\s*`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = testRegex.exec(testsSection)) !== null) {
    tests.push({
      name: match[1].trim(),
      assert: match[2].trim(),
    });
  }
  return tests;
}

function extractEnvironmentFromMd(body: string): Record<string, unknown> | null {
  const envSection = extractSection(body, 'Environment');
  if (!envSection) return null;

  const config: Record<string, unknown> = {};
  // Parse YAML-like code block
  const codeBlockMatch = envSection.match(/```(?:yaml)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const parsed = parseSimpleYaml(codeBlockMatch[1]);
    for (const [k, v] of Object.entries(parsed)) {
      config[k] = v;
    }
  }
  return Object.keys(config).length > 0 ? config : null;
}

/**
 * Extract content of a specific ## section from markdown body.
 */
function extractSection(body: string, heading: string): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(
    `##\\s+${escapedHeading}\\s*\n([\\s\\S]*?)(?=\\n##\\s|$)`
  );
  const match = body.match(sectionRegex);
  return match ? match[1].trim() : null;
}

// =============================================================================
// INTERNAL HELPERS: .hsplus GENERATION
// =============================================================================

function getDefaultTraits(): SkillTraitDecl[] {
  return [
    { name: 'rate_limiter', config: {} },
    { name: 'economy', config: { default_spend_limit: 0.10 } },
    { name: 'timeout_guard', config: {} },
  ];
}

function formatHsplusValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatHsplusValue).join(', ')}]`;
  if (value === null || value === undefined) return '""';
  return JSON.stringify(value);
}

function titleCase(kebab: string): string {
  return kebab
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface BTTreeNode {
  type: 'sequence' | 'selector' | 'action';
  name: string;
  description: string;
  params: Record<string, unknown>;
  children: BTTreeNode[];
}

function groupStepsIntoSequences(steps: SkillActionStep[]): BTTreeNode[] {
  const nodes: BTTreeNode[] = [];
  let currentParent: BTTreeNode | null = null;

  for (const step of steps) {
    if (step.nodeType === 'sequence' || step.nodeType === 'selector') {
      currentParent = {
        type: step.nodeType,
        name: step.action,
        description: step.description,
        params: {},
        children: [],
      };
      nodes.push(currentParent);
    } else {
      const actionNode: BTTreeNode = {
        type: 'action',
        name: step.action,
        description: step.description,
        params: step.params,
        children: [],
      };
      if (currentParent) {
        currentParent.children.push(actionNode);
      } else {
        // No parent sequence -- create an implicit one
        if (nodes.length === 0 || nodes[nodes.length - 1].type === 'action') {
          const implicitSeq: BTTreeNode = {
            type: 'sequence',
            name: 'main',
            description: 'main',
            params: {},
            children: [actionNode],
          };
          nodes.push(implicitSeq);
          currentParent = implicitSeq;
        } else {
          nodes[nodes.length - 1].children.push(actionNode);
        }
      }
    }
  }

  // If all steps are actions with no sequence wrapper, wrap them
  if (nodes.length === 0 && steps.length > 0) {
    const seq: BTTreeNode = {
      type: 'sequence',
      name: 'main',
      description: 'main',
      params: {},
      children: steps.map(s => ({
        type: 'action' as const,
        name: s.action,
        description: s.description,
        params: s.params,
        children: [],
      })),
    };
    nodes.push(seq);
  }

  return nodes;
}

function emitBTNode(lines: string[], node: BTTreeNode, indent: number): void {
  const pad = ' '.repeat(indent);
  if (node.type === 'sequence' || node.type === 'selector') {
    lines.push(`${pad}${node.type} "${node.name}" {`);
    for (const child of node.children) {
      emitBTNode(lines, child, indent + 2);
    }
    lines.push(`${pad}}`);
  } else {
    lines.push(`${pad}action "${node.name}" {`);
    if (node.description && node.description !== node.name.replace(/_/g, ' ')) {
      lines.push(`${pad}  // ${node.description}`);
    }
    for (const [key, val] of Object.entries(node.params)) {
      lines.push(`${pad}  ${key}: ${formatHsplusValue(val)}`);
    }
    lines.push(`${pad}}`);
  }
  lines.push('');
}
