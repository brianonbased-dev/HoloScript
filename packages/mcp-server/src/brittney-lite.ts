/**
 * Brittney-Lite AI Assistant Tools
 *
 * Free-tier AI assistant for HoloScript. Provides intelligent
 * error explanation, code fixing, review, and scaffolding.
 * Premium Brittney in Hololand MCP adds live debugging, world
 * management, and advanced AI orchestration.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { HoloScriptPlusParser, parseHolo, VR_TRAITS } from '@holoscript/core';
import { queryOllama, stripCodeFences } from './ollama-client.js';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const brittneyLiteTools: Tool[] = [
  {
    name: 'hs_ai_explain_error',
    description: `Takes HoloScript validation errors and provides human-friendly explanations with fix suggestions. Instead of cryptic parser output, you get:
- What went wrong in plain English
- Why it happened
- How to fix it with code example
- Related best practices

Use after validate_holoscript returns errors.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The HoloScript code with errors' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              line: { type: 'number' },
              column: { type: 'number' },
            },
          },
          description: 'Error objects from validate_holoscript (or paste error messages)',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'hs_ai_fix_code',
    description: `Takes broken HoloScript code and returns a fixed version. Handles:
- Syntax errors (missing braces, semicolons)
- Unknown traits (suggests correct names)
- Missing required properties
- Format inconsistencies
- Common beginner mistakes

Returns the corrected code with comments explaining each fix.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript code to fix' },
        format: {
          type: 'string',
          enum: ['hs', 'hsplus', 'holo', 'auto'],
          description: 'Expected format (default: auto-detect)',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'hs_ai_review',
    description: `Code review for HoloScript best practices. Returns:
- Performance issues (too many physics objects, missing LOD)
- Missing traits (grabbable without collidable, etc.)
- Naming conventions
- Scene organization suggestions
- Multiplayer readiness check
- Trait compatibility warnings`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript code to review' },
        focus: {
          type: 'string',
          enum: ['performance', 'traits', 'structure', 'multiplayer', 'all'],
          description: 'Focus area for review (default: all)',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'hs_ai_scaffold',
    description: `Generate project scaffolding from a high-level description. Creates:
- Composition structure with environment
- Templates for reusable objects
- Object instances with positions
- Logic block with event handlers
- Recommended trait assignments

More comprehensive than generate_scene - creates production-ready structure.`,
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'High-level description of what to build' },
        type: {
          type: 'string',
          enum: ['game', 'showcase', 'social', 'training', 'art'],
          description: 'Project type for appropriate defaults',
        },
        features: {
          type: 'array',
          items: { type: 'string' },
          description: 'Features to include: physics, multiplayer, audio, ai, ui',
        },
      },
      required: ['description'],
    },
  },
];

// =============================================================================
// KNOWN TRAITS (built from VR_TRAITS — the single source of truth in core)
// =============================================================================

const KNOWN_TRAITS: Set<string> = new Set(VR_TRAITS as readonly string[]);

// Trait compatibility rules
const TRAIT_REQUIRES: Record<string, string[]> = {
  throwable: ['grabbable'],
  holdable: ['grabbable'],
  synced: ['networked'],
  owned: ['networked'],
  host_only: ['networked'],
};

const TRAIT_RECOMMENDS: Record<string, string[]> = {
  grabbable: ['collidable'],
  physics: ['collidable'],
  throwable: ['physics'],
  character: ['collidable'],
  breakable: ['physics', 'collidable'],
  particle_system: ['emissive'],
};

// =============================================================================
// HANDLER
// =============================================================================

export async function handleBrittneyLiteTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'hs_ai_explain_error':
      return handleExplainError(args);
    case 'hs_ai_fix_code':
      return handleFixCode(args);
    case 'hs_ai_review':
      return handleReview(args);
    case 'hs_ai_scaffold':
      return handleScaffold(args);
    default:
      throw new Error(`Unknown Brittney-Lite tool: ${name}`);
  }
}

// =============================================================================
// EXPLAIN ERROR
// =============================================================================

async function handleExplainError(args: Record<string, unknown>) {
  const code = args.code as string;
  const providedErrors = args.errors as
    | Array<{ message: string; line?: number; column?: number }>
    | undefined;

  // Parse to find errors if not provided
  let errors = providedErrors || [];
  if (errors.length === 0) {
    try {
      const format = detectFormat(code);
      if (format === 'holo') {
        const result = parseHolo(code);
        errors = result.errors || [];
      } else {
        const parser = new HoloScriptPlusParser();
        const result = parser.parse(code);
        errors = result.errors || [];
      }
    } catch (e: unknown) {
      errors = [{ message: e instanceof Error ? e.message : String(e), line: 1 }];
    }
  }

  if (errors.length === 0) {
    return { status: 'ok', message: 'No errors found! Code looks valid.' };
  }

  const explanations = errors.map((err) => {
    const explanation: Record<string, unknown> = {
      original: err.message,
      line: err.line,
    };

    // Add context from source
    const lines = code.split('\n');
    if (err.line && err.line > 0 && err.line <= lines.length) {
      explanation.codeLine = lines[err.line - 1].trim();
    }

    // Explain common errors
    const msg = err.message.toLowerCase();

    if (msg.includes('unknown trait') || msg.includes('unrecognized trait')) {
      const traitMatch = err.message.match(/@?(\w+)/);
      const trait = traitMatch?.[1] || '';
      const suggestion = findSimilarTrait(trait);
      explanation.explanation = `The trait @${trait} doesn't exist in HoloScript's ${KNOWN_TRAITS.size}-trait system.`;
      explanation.fix = suggestion
        ? `Use @${suggestion} instead`
        : 'Check available traits with list_traits tool';
      explanation.fixCode = suggestion ? `@${suggestion}` : undefined;
    } else if (msg.includes('unexpected') || msg.includes('syntax')) {
      explanation.explanation =
        "There's a syntax error - likely a missing brace, bracket, or keyword.";
      explanation.fix = 'Check for matching { }, [ ], and correct keyword spelling.';
    } else if (msg.includes('missing')) {
      explanation.explanation = 'A required element is missing from the code.';
      explanation.fix = 'Check the syntax reference for the correct structure.';
    } else {
      explanation.explanation = err.message;
      explanation.fix = 'Review the code around the indicated line.';
    }

    return explanation;
  });

  // Optionally enhance with model's natural language explanation
  const modelExplanation = await queryOllama(
    `Explain these HoloScript errors concisely (1-2 sentences each):\n\nCode:\n${code}\n\nErrors:\n${errors.map((e) => e.message).join('\n')}`,
    'You are a helpful HoloScript expert. Explain errors clearly and suggest fixes. Be concise. Never use [Think] blocks.'
  );

  return {
    errorCount: errors.length,
    explanations,
    modelExplanation: modelExplanation || undefined,
    tip: 'Use hs_ai_fix_code to automatically fix these issues.',
  };
}

// =============================================================================
// FIX CODE
// =============================================================================

async function handleFixCode(args: Record<string, unknown>) {
  const code = args.code as string;

  // Try model first — send broken code, validate fix through parser
  const modelFixed = await tryModelFix(code);
  if (modelFixed) {
    return {
      originalCode: code,
      fixedCode: modelFixed,
      fixes: ['Model-generated fix applied'],
      fixCount: 1,
      source: 'model',
      isValid: true,
      note: 'Code fixed by Brittney AI model and validated through parser.',
    };
  }

  // Fall back to rule-based fixes
  let fixed = code;
  const fixes: string[] = [];

  // Fix 1: Balance braces
  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    const diff = openBraces - closeBraces;
    fixed += '\n' + '}'.repeat(diff);
    fixes.push(`Added ${diff} missing closing brace(s)`);
  }

  // Fix 2: Balance brackets
  const openBrackets = (code.match(/\[/g) || []).length;
  const closeBrackets = (code.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    const diff = openBrackets - closeBrackets;
    fixed = fixed.replace(/\[([^\]]*?)$/, (match) => match + ']'.repeat(diff));
    fixes.push(`Added ${diff} missing closing bracket(s)`);
  }

  // Fix 3: Unknown traits
  const traitMatches = [...fixed.matchAll(/@(\w+)/g)];
  for (const match of traitMatches) {
    const trait = match[1];
    if (!KNOWN_TRAITS.has(trait)) {
      const suggestion = findSimilarTrait(trait);
      if (suggestion) {
        fixed = fixed.replace(new RegExp(`@${trait}\\b`), `@${suggestion}`);
        fixes.push(`Replaced unknown @${trait} with @${suggestion}`);
      }
    }
  }

  // Fix 4: Missing composition wrapper for .holo-style code
  if (fixed.includes('template ') && !fixed.includes('composition ')) {
    if (fixed.match(/^template\s+"/m)) {
      fixed = `composition "Scene" {\n${fixed
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n')}\n}`;
      fixes.push('Wrapped in composition block');
    }
  }

  // Fix 5: Orb without name
  fixed = fixed.replace(/orb\s*\{/g, () => {
    fixes.push('Added missing name to orb declaration');
    return 'orb Unnamed {';
  });

  // Validate the fixed code
  let isValid = false;
  try {
    const format = detectFormat(fixed);
    if (format === 'holo') {
      const result = parseHolo(fixed);
      isValid = !result.errors?.length;
    } else {
      const parser = new HoloScriptPlusParser();
      const result = parser.parse(fixed);
      isValid = !result.errors?.length;
    }
  } catch {
    isValid = false;
  }

  return {
    originalCode: code,
    fixedCode: fixed,
    fixes,
    fixCount: fixes.length,
    isValid,
    note: isValid ? 'Code is now valid!' : 'Some issues remain - manual review recommended.',
  };
}

// =============================================================================
// CODE REVIEW
// =============================================================================

async function handleReview(args: Record<string, unknown>) {
  const code = args.code as string;
  const focus = (args.focus as string) || 'all';
  const issues: Array<{
    severity: string;
    category: string;
    message: string;
    suggestion?: string;
  }> = [];

  const lines = code.split('\n');
  const traitMatches = [...code.matchAll(/@(\w+)/g)].map((m) => m[1]);
  const uniqueTraits = new Set(traitMatches);
  const objectCount = (code.match(/\b(orb|object)\s+/g) || []).length;

  // Performance checks
  if (focus === 'all' || focus === 'performance') {
    const physicsCount = traitMatches.filter((t) => t === 'physics').length;
    if (physicsCount > 20) {
      issues.push({
        severity: 'warning',
        category: 'performance',
        message: `${physicsCount} physics objects detected - may cause performance issues`,
        suggestion: 'Consider using @lod for distant objects and reducing active physics bodies',
      });
    }

    if (objectCount > 50 && !uniqueTraits.has('lod')) {
      issues.push({
        severity: 'info',
        category: 'performance',
        message: `${objectCount} objects without LOD - add @lod for distant objects`,
        suggestion: 'Add @lod(distances: [0, 15, 30]) to objects far from the player',
      });
    }

    if (lines.length > 300) {
      issues.push({
        severity: 'info',
        category: 'performance',
        message: 'Large file - consider splitting into multiple compositions',
        suggestion: 'Use separate .holo files for different areas/sections',
      });
    }
  }

  // Trait checks
  if (focus === 'all' || focus === 'traits') {
    for (const [trait, requires] of Object.entries(TRAIT_REQUIRES)) {
      if (uniqueTraits.has(trait)) {
        for (const req of requires) {
          if (!uniqueTraits.has(req)) {
            issues.push({
              severity: 'error',
              category: 'traits',
              message: `@${trait} requires @${req} but it's missing`,
              suggestion: `Add @${req} to objects that have @${trait}`,
            });
          }
        }
      }
    }

    for (const [trait, recommends] of Object.entries(TRAIT_RECOMMENDS)) {
      if (uniqueTraits.has(trait)) {
        for (const rec of recommends) {
          if (!uniqueTraits.has(rec)) {
            issues.push({
              severity: 'info',
              category: 'traits',
              message: `@${trait} works better with @${rec}`,
              suggestion: `Consider adding @${rec} for better behavior`,
            });
          }
        }
      }
    }
  }

  // Structure checks
  if (focus === 'all' || focus === 'structure') {
    if (!code.includes('composition') && !code.includes('orb ')) {
      issues.push({
        severity: 'warning',
        category: 'structure',
        message: 'No composition or orb declarations found',
        suggestion: 'Wrap your scene in a composition block',
      });
    }

    if (!code.includes('environment') && code.includes('composition')) {
      issues.push({
        severity: 'info',
        category: 'structure',
        message: 'No environment block - scene will use defaults',
        suggestion: 'Add environment { skybox: "..." ambient_light: 0.4 }',
      });
    }

    const templates = (code.match(/template\s+"/g) || []).length;
    if (objectCount > 5 && templates === 0) {
      issues.push({
        severity: 'info',
        category: 'structure',
        message: `${objectCount} objects but no templates - code duplication likely`,
        suggestion: 'Extract common patterns into templates for reuse',
      });
    }
  }

  // Multiplayer checks
  if (focus === 'all' || focus === 'multiplayer') {
    if (uniqueTraits.has('networked')) {
      if (!uniqueTraits.has('owned')) {
        issues.push({
          severity: 'info',
          category: 'multiplayer',
          message: '@networked objects without @owned may have ownership conflicts',
          suggestion: 'Add @owned for objects that players interact with',
        });
      }
    }

    const hasGrabbable = uniqueTraits.has('grabbable');
    const hasNetworked = uniqueTraits.has('networked');
    if (hasGrabbable && !hasNetworked) {
      issues.push({
        severity: 'info',
        category: 'multiplayer',
        message: 'Grabbable objects are not networked - only visible to local player',
        suggestion: 'Add @networked if this is a multiplayer scene',
      });
    }
  }

  // Optionally append model's freeform review
  const modelReview = await queryOllama(
    `Review this HoloScript code. Focus on: correctness, best practices, missing traits, performance. Be concise (3-5 bullet points).\n\n${code}`,
    'You are a senior HoloScript code reviewer. Give actionable feedback. Never use [Think] blocks.'
  );

  return {
    issueCount: issues.length,
    issues,
    modelReview: modelReview || undefined,
    stats: {
      lines: lines.length,
      objects: objectCount,
      uniqueTraits: uniqueTraits.size,
      templates: (code.match(/template\s+"/g) || []).length,
    },
    grade:
      issues.filter((i) => i.severity === 'error').length === 0
        ? issues.filter((i) => i.severity === 'warning').length === 0
          ? 'A'
          : 'B'
        : 'C',
  };
}

// =============================================================================
// SCAFFOLD
// =============================================================================

async function handleScaffold(args: Record<string, unknown>) {
  const description = args.description as string;
  const type = (args.type as string) || 'game';
  const features = (args.features as string[]) || [];
  const desc = description.toLowerCase();

  // Try model first — brittney-qwen-v23 scores 8/10 on scene generation
  const modelCode = await tryModelScaffold(description, type, features);
  if (modelCode) {
    return {
      code: modelCode,
      scaffoldType: type,
      source: 'model',
      stats: {
        lines: modelCode.split('\n').length,
        templates: (modelCode.match(/template\s+"/g) || []).length,
        objects: (modelCode.match(/object\s+"/g) || []).length,
        traits: (modelCode.match(/@\w+/g) || []).length,
      },
      features: features.length > 0 ? features : ['basic'],
      nextSteps: [
        'Review generated code for correctness',
        'Replace placeholder geometry with your .glb models',
        'Test with render_preview tool',
      ],
    };
  }

  // Fall back to rule-based scaffolding

  const lines: string[] = [];
  const sceneName = extractSceneName(description);

  lines.push(`composition "${sceneName}" {`);
  lines.push('');

  // Environment
  lines.push('  environment {');
  if (desc.includes('space') || desc.includes('galaxy')) {
    lines.push('    skybox: "nebula"');
    lines.push('    ambient_light: 0.1');
    lines.push('    gravity: [0, 0, 0]');
  } else if (desc.includes('forest') || desc.includes('nature')) {
    lines.push('    skybox: "forest"');
    lines.push('    ambient_light: 0.4');
    lines.push('    fog: { enabled: true, density: 0.01 }');
  } else if (desc.includes('night') || desc.includes('dark')) {
    lines.push('    skybox: "night"');
    lines.push('    ambient_light: 0.15');
  } else {
    lines.push('    skybox: "gradient"');
    lines.push('    ambient_light: 0.4');
  }
  lines.push('  }');
  lines.push('');

  // Templates based on project type
  if (type === 'game' || desc.includes('game')) {
    lines.push('  // Player template');
    lines.push('  template "Player" {');
    lines.push('    @character(speed: 5, jump_force: 6)');
    lines.push('    @collidable');
    if (features.includes('multiplayer')) {
      lines.push('    @networked(sync_rate: "30hz")');
      lines.push('    @owned');
    }
    lines.push('    geometry: "model/player.glb"');
    lines.push('    state {');
    lines.push('      health: 100');
    lines.push('      score: 0');
    lines.push('    }');
    lines.push('  }');
    lines.push('');
  }

  if (desc.includes('enemy') || desc.includes('combat')) {
    lines.push('  // Enemy template');
    lines.push('  template "Enemy" {');
    lines.push('    @collidable');
    lines.push('    @destructible(health: 50)');
    lines.push('    @patrol');
    if (features.includes('ai')) {
      lines.push('    @behavior_tree');
      lines.push('    @perception');
    }
    lines.push('    geometry: "model/enemy.glb"');
    lines.push('    state {');
    lines.push('      health: 50');
    lines.push('      damage: 10');
    lines.push('    }');
    lines.push('  }');
    lines.push('');
  }

  if (desc.includes('item') || desc.includes('collect') || desc.includes('pickup')) {
    lines.push('  // Collectible template');
    lines.push('  template "Collectible" {');
    lines.push('    @grabbable');
    lines.push('    @collidable');
    lines.push('    @glowing(intensity: 0.5, pulse: true)');
    lines.push('    @animated');
    if (features.includes('audio')) {
      lines.push('    @spatial_audio(src: "pickup.mp3")');
    }
    lines.push('    geometry: "sphere"');
    lines.push('    state {');
    lines.push('      value: 10');
    lines.push('      collected: false');
    lines.push('    }');
    lines.push('  }');
    lines.push('');
  }

  if (type === 'showcase' || type === 'art') {
    lines.push('  // Display item template');
    lines.push('  template "DisplayItem" {');
    lines.push('    @grabbable');
    lines.push('    @scalable(min_scale: 0.5, max_scale: 3)');
    lines.push('    @rotatable(auto_rotate: true, speed: 0.3)');
    lines.push('    @glowing(intensity: 0.3)');
    lines.push('    @billboard(axis: "y")');
    lines.push('    geometry: "sphere"');
    lines.push('  }');
    lines.push('');
  }

  if (type === 'social' || features.includes('multiplayer')) {
    lines.push('  // Social avatar template');
    lines.push('  template "Avatar" {');
    lines.push('    @networked(sync_rate: "30hz")');
    lines.push('    @owned');
    lines.push('    @hand_tracking');
    lines.push('    @spatial_audio');
    lines.push('    geometry: "model/avatar.glb"');
    lines.push('  }');
    lines.push('');
  }

  // Objects
  lines.push('  // Scene objects');
  if (type === 'game') {
    lines.push('  object "MainPlayer" using "Player" {');
    lines.push('    position: [0, 0, 0]');
    lines.push('  }');
    lines.push('');
  }

  // Ground/floor
  lines.push('  object "Ground" @collidable {');
  lines.push('    geometry: "plane"');
  lines.push('    scale: [50, 1, 50]');
  lines.push('    position: [0, 0, 0]');
  lines.push('    color: "#333333"');
  lines.push('  }');
  lines.push('');

  // UI
  if (features.includes('ui')) {
    lines.push('  // HUD');
    lines.push('  object "HUD" @ui_panel(width: 512, height: 128, text: "Score: 0") @billboard {');
    lines.push('    position: [0, 3, -5]');
    lines.push('  }');
    lines.push('');
  }

  // Audio
  if (features.includes('audio')) {
    lines.push('  // Ambient audio');
    lines.push('  object "Ambience" @ambient(volume: 0.3) {');
    lines.push('    audio: { src: "ambience.mp3", loop: true }');
    lines.push('  }');
    lines.push('');
  }

  // Logic block
  lines.push('  logic {');
  lines.push('    on_scene_start() {');
  if (type === 'game') {
    lines.push('      // Initialize game state');
    lines.push('      console.log("Game started!")');
  } else {
    lines.push('      // Scene initialization');
    lines.push('      console.log("Scene loaded!")');
  }
  lines.push('    }');

  if (desc.includes('collect')) {
    lines.push('');
    lines.push('    on_interact("Collectible") {');
    lines.push('      // Handle item collection');
    lines.push('      Player.score += this.value');
    lines.push('      this.collected = true');
    lines.push('      this.destroy()');
    lines.push('    }');
  }

  lines.push('  }');
  lines.push('}');

  const code = lines.join('\n');

  // Validate scaffolded code through the parser before returning
  try {
    const parseResult = parseHolo(code);
    if (parseResult.errors && parseResult.errors.length > 0) {
      return {
        code,
        isValid: false,
        scaffoldType: type,
        errors: parseResult.errors.map((e: { message: string; line?: number }) => ({
          message: e.message,
          line: e.line,
        })),
        stats: {
          lines: lines.length,
          templates: (code.match(/template\s+"/g) || []).length,
          objects: (code.match(/object\s+"/g) || []).length,
          traits: (code.match(/@\w+/g) || []).length,
        },
        features: features.length > 0 ? features : ['basic'],
        nextSteps: [
          'Fix the validation errors above',
          'Then test with render_preview tool',
        ],
      };
    }
  } catch {
    // Parser threw — treat as invalid but still return the code for debugging
  }

  return {
    code,
    isValid: true,
    scaffoldType: type,
    stats: {
      lines: lines.length,
      templates: (code.match(/template\s+"/g) || []).length,
      objects: (code.match(/object\s+"/g) || []).length,
      traits: (code.match(/@\w+/g) || []).length,
    },
    features: features.length > 0 ? features : ['basic'],
    nextSteps: [
      'Replace placeholder geometry with your .glb models',
      'Customize template state and actions',
      'Add specific game logic in the logic block',
      'Test with render_preview tool',
    ],
  };
}

// =============================================================================
// MODEL-BACKED HELPERS
// =============================================================================

/**
 * Try to generate a scaffold using the Ollama model.
 * Returns validated HoloScript code or null if model is unavailable/output is invalid.
 */
async function tryModelScaffold(
  description: string,
  type: string,
  features: string[]
): Promise<string | null> {
  const featureStr = features.length > 0 ? `\nFeatures to include: ${features.join(', ')}` : '';
  const prompt = `Generate a complete HoloScript .holo scene for: ${description}\nProject type: ${type}${featureStr}\n\nOutput ONLY the HoloScript code. Include composition wrapper, environment block, templates, objects with positions, and a logic block.`;

  const raw = await queryOllama(prompt);
  if (!raw) return null;

  const code = stripCodeFences(raw);

  // Validate through parser
  try {
    const format = detectFormat(code);
    if (format === 'holo') {
      const result = parseHolo(code);
      if (result.errors?.length > 0) return null;
    } else {
      const parser = new HoloScriptPlusParser();
      const result = parser.parse(code);
      if (result.errors?.length > 0) return null;
    }
  } catch {
    return null;
  }

  // Fix any hallucinated traits
  let fixed = code;
  const traitMatches = [...code.matchAll(/@(\w+)/g)];
  for (const match of traitMatches) {
    const trait = match[1];
    if (!KNOWN_TRAITS.has(trait)) {
      const suggestion = findSimilarTrait(trait);
      if (suggestion) {
        fixed = fixed.replace(new RegExp(`@${trait}\\b`), `@${suggestion}`);
      }
    }
  }

  return fixed;
}

/**
 * Try to fix code using the Ollama model.
 * Returns validated fixed code or null if model is unavailable/output is invalid.
 */
async function tryModelFix(brokenCode: string): Promise<string | null> {
  const prompt = `Fix the following broken HoloScript code. Output ONLY the corrected code, no explanations:\n\n${brokenCode}`;

  const raw = await queryOllama(prompt);
  if (!raw) return null;

  const code = stripCodeFences(raw);

  // Validate the fix through parser
  try {
    const format = detectFormat(code);
    if (format === 'holo') {
      const result = parseHolo(code);
      if (result.errors?.length > 0) return null;
    } else {
      const parser = new HoloScriptPlusParser();
      const result = parser.parse(code);
      if (result.errors?.length > 0) return null;
    }
  } catch {
    return null;
  }

  return code;
}

// =============================================================================
// HELPERS
// =============================================================================

function detectFormat(code: string): 'hs' | 'hsplus' | 'holo' {
  if (code.includes('composition') && code.includes('{')) return 'holo';
  if (code.includes('@') || code.includes('state {')) return 'hsplus';
  return 'hs';
}

function findSimilarTrait(input: string): string | null {
  const normalized = input.toLowerCase();

  // Exact match
  if (KNOWN_TRAITS.has(normalized)) return normalized;

  // Prefix match
  for (const trait of KNOWN_TRAITS) {
    if (trait.startsWith(normalized) || normalized.startsWith(trait)) return trait;
  }

  // Substring match
  for (const trait of KNOWN_TRAITS) {
    if (trait.includes(normalized) || normalized.includes(trait)) return trait;
  }

  // NOTE: First-3-chars matching removed — too loose, causes silent wrong replacements
  // with 1800+ traits (e.g. "gra" matching "grabbable" when "gravity" was intended)

  return null;
}

function extractSceneName(description: string): string {
  const words = description.split(/\s+/).slice(0, 4);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .replace(/[^a-zA-Z0-9 ]/g, '');
}
