/**
 * MCP Tool Handlers for HoloScript
 *
 * Implements the logic for each MCP tool.
 * Dispatches to specialized handlers for graph, IDE, and Brittney-Lite tools.
 */

import { HoloScriptPlusParser, parseHolo, parseHoloStrict, VR_TRAITS } from '@holoscript/core';

import { generateObjectForMCP, generateSceneForMCP, suggestTraits, suggestUniversalTraits } from './generators';
import { generateHololandDataset, datasetToJsonl, TrainingCategory } from './training-generators';
import { renderPreview, createShareLink } from './renderer';
import { handleEditHoloTool } from './edit-holo-tools';
import { TRAIT_DOCS, SYNTAX_DOCS, EXAMPLES } from './documentation';
import { handleCodebaseTool } from './codebase-tools';
import { handleGraphTool } from './graph-tools';
import { handleIDETool } from './ide-tools';
import { handleBrittneyLiteTool } from './brittney-lite';
import { handleWisdomGotchaTool } from './wisdom-gotcha-tools';
import { PluginManager } from './PluginManager';
import {
  browserLaunch,
  browserExecute,
  browserScreenshot,
  BrowserLaunchSchema,
  BrowserExecuteSchema,
  BrowserScreenshotSchema,
} from './browser/browser-tools';

// Trait categories mapping — representative samples per category.
// Full 1,800+ trait list is available via the 'all' category (sourced from @holoscript/core).
const TRAIT_CATEGORIES: Record<string, string[]> = {
  interaction: [
    '@grabbable', '@throwable', '@holdable', '@clickable', '@hoverable',
    '@draggable', '@pointable', '@scalable', '@rotatable', '@snappable',
  ],
  physics: [
    '@collidable', '@physics', '@rigid', '@kinematic', '@trigger', '@gravity',
    '@soft_body', '@fluid', '@magnetic', '@buoyant',
  ],
  visual: [
    '@glowing', '@emissive', '@transparent', '@reflective', '@animated',
    '@billboard', '@particle', '@holographic', '@volumetric', '@shader_custom',
  ],
  networking: [
    '@networked', '@synced', '@persistent', '@owned', '@host_only',
    '@replicated', '@authority', '@interpolated',
  ],
  behavior: [
    '@stackable', '@attachable', '@equippable', '@consumable', '@destructible',
    '@breakable', '@character', '@npc', '@pathfinding', '@state_machine',
  ],
  spatial: [
    '@anchor', '@tracked', '@world_locked', '@hand_tracked', '@eye_tracked',
    '@plane_detected', '@image_tracked', '@face_tracked',
  ],
  audio: [
    '@spatial_audio', '@ambient', '@voice_activated', '@reverb', '@doppler',
    '@music', '@procedural_audio',
  ],
  state: [
    '@state', '@reactive', '@observable', '@computed', '@event_driven',
    '@persistent_state', '@replicated_state',
  ],
  ai: [
    '@llm_agent', '@npc', '@crowd', '@reactive', '@pathfinding',
    '@emotion', '@dialogue', '@decision_tree',
  ],
  accessibility: [
    '@high_contrast', '@screen_reader', '@reduced_motion', '@voice_nav',
    '@colorblind_safe', '@haptic_feedback',
  ],
  iot: [
    '@iot_sensor', '@digital_twin', '@mqtt_bridge', '@telemetry',
    '@actuator', '@stream_data',
  ],
  web3: [
    '@nft_asset', '@token_gated', '@wallet_connected', '@on_chain',
    '@dao_governed', '@smart_contract',
  ],
  advanced: [
    '@teleport', '@ui_panel', '@particle_system', '@weather', '@day_night',
    '@lod', '@hand_tracking', '@haptic', '@portal', '@mirror',
    '@ray_traced', '@compute_shader', '@lod_managed',
  ],
  social: [
    '@shareable', '@collaborative', '@tweetable',
  ],
};

// All 1,800+ traits from @holoscript/core
const ALL_TRAITS: readonly string[] = VR_TRAITS;

/**
 * Main handler dispatcher for all tools
 */
export async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Core tools
  switch (name) {
    case 'parse_hs':
      return handleParseHs(args);
    case 'parse_holo':
      return handleParseHolo(args);
    case 'validate_holoscript':
      return handleValidate(args);
    case 'list_traits':
      return handleListTraits(args);
    case 'explain_trait':
      return handleExplainTrait(args);
    case 'suggest_traits':
      return handleSuggestTraits(args);
    case 'suggest_universal_traits':
      return handleSuggestUniversalTraits(args);
    case 'generate_object':
      return handleGenerateObject(args);
    case 'generate_scene':
      return handleGenerateScene(args);
    case 'get_syntax_reference':
      return handleGetSyntaxReference(args);
    case 'get_examples':
      return handleGetExamples(args);
    case 'explain_code':
      return handleExplainCode(args);
    case 'analyze_code':
      return handleAnalyzeCode(args);
    case 'render_preview':
      return handleRenderPreview(args);
    case 'create_share_link':
      return handleCreateShareLink(args);
    case 'convert_format':
      return handleConvertFormat(args);
    case 'edit_holo': {
      const result = await handleEditHoloTool(name, args);
      if (result !== null) return result;
      throw new Error('edit_holo handler returned null');
    }

    // Browser control tools
    case 'browser_launch':
      return browserLaunch(BrowserLaunchSchema.parse(args));
    case 'browser_execute':
      return browserExecute(BrowserExecuteSchema.parse(args));
    case 'browser_screenshot':
      return browserScreenshot(BrowserScreenshotSchema.parse(args));
  }

  // Route codebase-intelligence tools first, then wisdom/gotcha tools, then graph tools.
  // All share the `holo_` prefix.
  if (name.startsWith('holo_')) {
    const codebaseResult = await handleCodebaseTool(name, args);
    if (codebaseResult !== null) {
      return codebaseResult;
    }
    const wisdomResult = await handleWisdomGotchaTool(name, args);
    if (wisdomResult !== null) {
      return wisdomResult;
    }
    return handleGraphTool(name, args);
  }

  // IDE tools (migrated from Hololand/Brittney)
  if (name.startsWith('hs_') && !name.startsWith('hs_ai_')) {
    return handleIDETool(name, args);
  }

  // Brittney-Lite AI tools
  if (name.startsWith('hs_ai_')) {
    return handleBrittneyLiteTool(name, args);
  }

  // Text-to-3D pipeline
  if (name === 'generate_3d_object') {
    return handleGenerate3DObject(args);
  }

  // Hololand training data generation
  if (name === 'generate_hololand_training') {
    return handleGenerateHololandTraining(args);
  }

  // Service contract tools
  if (name === 'generate_service_contract' || name === 'explain_service_contract') {
    const { handleServiceContractTool } = await import('./service-contract-tools');
    return handleServiceContractTool(name, args);
  }

  // Handle plugins
  const pluginResult = await PluginManager.handleTool(name, args);
  if (pluginResult !== null) {
    return pluginResult;
  }

  throw new Error(`Unknown tool: ${name}`);
}

// === PARSING HANDLERS ===

async function handleParseHs(args: Record<string, unknown>) {
  const code = args.code as string;
  const _format = (args.format as string) || 'hsplus';

  try {
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);

    return {
      success: true,
      ast: result.ast,
      errors: result.errors || [],
      warnings: result.warnings || [],
      ...(args.includeSourceMap ? { sourceMap: result.sourceMap } : {}),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function handleParseHolo(args: Record<string, unknown>) {
  const code = args.code as string;
  const strict = args.strict as boolean;

  try {
    const result = strict ? parseHoloStrict(code) : parseHolo(code);

    return {
      success: true,
      composition: result,
      errors: ('errors' in result ? result.errors : []) || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// === VALIDATION HANDLER ===

async function handleValidate(args: Record<string, unknown>) {
  const code = args.code as string;
  const format = (args.format as string) || 'auto';
  const includeWarnings = args.includeWarnings !== false;
  const includeSuggestions = args.includeSuggestions !== false;

  try {
    // Detect format if auto
    const detectedFormat = format === 'auto' ? detectFormat(code) : format;

    // Parse based on format
    let parseResult;
    if (detectedFormat === 'holo') {
      parseResult = parseHolo(code);
    } else {
      const parser = new HoloScriptPlusParser();
      parseResult = parser.parse(code);
    }

    const errors: AIFriendlyError[] = [];
    const warnings: AIFriendlyError[] = [];

    // Convert errors to AI-friendly format
    if (parseResult.errors) {
      for (const err of parseResult.errors) {
        const aiError = toAIFriendlyError(err, code, includeSuggestions);
        errors.push(aiError);
      }
    }

    if (includeWarnings && parseResult.warnings) {
      for (const warn of parseResult.warnings) {
        const aiWarn = toAIFriendlyError(warn, code, includeSuggestions);
        warnings.push(aiWarn);
      }
    }

    return {
      valid: errors.length === 0,
      format: detectedFormat,
      errors,
      ...(includeWarnings && { warnings }),
      summary:
        errors.length === 0 ? '✅ Valid HoloScript code' : `❌ Found ${errors.length} error(s)`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// === TRAITS HANDLERS ===

async function handleListTraits(args: Record<string, unknown>) {
  const category = (args.category as string) || 'all';

  if (category === 'all') {
    return {
      total: ALL_TRAITS.length,
      categories: Object.fromEntries(
        Object.entries(TRAIT_CATEGORIES).map(([k, v]) => [k, v.length])
      ),
      list: ALL_TRAITS,
    };
  }

  const traits = TRAIT_CATEGORIES[category];
  if (!traits) {
    return {
      error: `Unknown category: ${category}`,
      validCategories: Object.keys(TRAIT_CATEGORIES),
    };
  }

  return {
    category,
    count: traits.length,
    traits,
  };
}

async function handleExplainTrait(args: Record<string, unknown>) {
  let trait = args.trait as string;

  // Normalize trait name
  if (!trait.startsWith('@')) {
    trait = '@' + trait;
  }

  const doc = TRAIT_DOCS[trait];
  if (!doc) {
    // Find similar traits
    const similar = findSimilarTraits(trait);
    return {
      error: `Unknown trait: ${trait}`,
      suggestion: similar.length > 0 ? `Did you mean: ${similar.join(', ')}?` : null,
      allTraits: ALL_TRAITS,
    };
  }

  return doc;
}

async function handleSuggestTraits(args: Record<string, unknown>) {
  const description = args.description as string;
  const context = args.context as string | undefined;

  return suggestTraits(description, context);
}

async function handleSuggestUniversalTraits(args: Record<string, unknown>) {
  const description = args.description as string;
  const domain = args.domain as string | undefined;
  const context = args.context as string | undefined;

  return suggestUniversalTraits(description, domain, context);
}

// === GENERATION HANDLERS ===

async function handleGenerateObject(args: Record<string, unknown>) {
  const description = args.description as string;
  const format = (args.format as string) || 'hsplus';
  const includeDocs = args.includeDocs as boolean;

  return generateObjectForMCP(description, {
    format: format as 'hs' | 'hsplus' | 'holo',
    includeDocs,
  });
}

async function handleGenerateScene(args: Record<string, unknown>) {
  const description = args.description as string;
  const style = (args.style as string) || 'detailed';
  const features = (args.features as string[]) || [];

  return generateSceneForMCP(description, {
    style: style as 'minimal' | 'detailed' | 'production',
    features,
  });
}

// === DOCUMENTATION HANDLERS ===

async function handleGetSyntaxReference(args: Record<string, unknown>) {
  const topic = args.topic as string;

  const doc = SYNTAX_DOCS[topic];
  if (!doc) {
    return {
      error: `Unknown topic: ${topic}`,
      availableTopics: Object.keys(SYNTAX_DOCS),
    };
  }

  return doc;
}

async function handleGetExamples(args: Record<string, unknown>) {
  const pattern = args.pattern as string;

  const example = EXAMPLES[pattern];
  if (!example) {
    return {
      error: `Unknown pattern: ${pattern}`,
      availablePatterns: Object.keys(EXAMPLES),
    };
  }

  return example;
}

async function handleExplainCode(args: Record<string, unknown>) {
  const code = args.code as string;
  const detail = (args.detail as string) || 'detailed';

  // Parse the code first
  const format = detectFormat(code);
  let parsed;

  try {
    if (format === 'holo') {
      parsed = parseHolo(code);
    } else {
      const parser = new HoloScriptPlusParser();
      parsed = parser.parse(code);
    }
  } catch (error) {
    return {
      error: 'Failed to parse code',
      parseError: error instanceof Error ? error.message : String(error),
    };
  }

  // Generate explanation based on AST
  const explanation = generateExplanation(parsed, detail);

  return {
    format,
    explanation,
    detail,
  };
}

async function handleAnalyzeCode(args: Record<string, unknown>) {
  const code = args.code as string;
  const format = detectFormat(code);

  let parsed;
  try {
    if (format === 'holo') {
      parsed = parseHolo(code);
    } else {
      const parser = new HoloScriptPlusParser();
      parsed = parser.parse(code);
    }
  } catch (error) {
    return {
      error: 'Failed to parse code',
      parseError: error instanceof Error ? error.message : String(error),
    };
  }

  return analyzeAST(parsed, code);
}

// === RENDERING HANDLERS ===

async function handleRenderPreview(args: Record<string, unknown>) {
  return renderPreview({
    code: args.code as string,
    format: ((args.format as string) || 'png') as 'png' | 'gif' | 'mp4' | 'webp',
    resolution: (args.resolution as number[]) || [800, 600],
    camera: args.camera as { position?: number[]; target?: number[] },
    duration: args.duration as number,
    quality: ((args.quality as string) || 'preview') as 'draft' | 'preview' | 'production',
  });
}

async function handleCreateShareLink(args: Record<string, unknown>) {
  return createShareLink({
    code: args.code as string,
    title: args.title as string,
    description: args.description as string,
    platform: ((args.platform as string) || 'x') as 'x' | 'generic' | 'codesandbox' | 'stackblitz',
  });
}

// === CONVERSION HANDLER ===

async function handleConvertFormat(args: Record<string, unknown>) {
  const code = args.code as string;
  const from = args.from as string;
  const to = args.to as string;

  try {
    const convertedCode = convertFormat(code, from, to);
    return {
      success: true,
      original: from,
      target: to,
      code: convertedCode,
      note: 'Format conversion is a best-effort process. Manual review recommended.',
    };
  } catch (error) {
    return {
      success: false,
      original: from,
      target: to,
      code: code,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Convert between HoloScript formats (hs, hsplus, holo)
 */
function convertFormat(code: string, from: string, to: string): string {
  // First, parse the source format
  let ast: any;

  if (from === 'holo') {
    ast = parseHolo(code);
  } else {
    // HoloScriptPlusParser handles both .hs and .hsplus formats
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);
    ast = result.ast;
  }

  // Convert AST to target format
  if (to === 'holo') {
    return convertToHolo(ast, from);
  } else if (to === 'hsplus') {
    return convertToHsPlus(ast, from);
  } else {
    return convertToHs(ast, from);
  }
}

function convertToHolo(ast: any, _from: string): string {
  const lines: string[] = [];
  lines.push('composition "Converted Scene" {');

  // Add environment block
  lines.push('  environment {');
  lines.push('    skybox: "nebula"');
  lines.push('    ambient_light: 0.4');
  lines.push('  }');
  lines.push('');

  // Extract objects from AST
  const objects = extractObjects(ast);

  for (const obj of objects) {
    const traits = obj.traits?.length
      ? obj.traits.map((t: string) => `@${t.replace('@', '')}`).join(' ')
      : '';
    lines.push(`  object "${obj.name || 'obj'}" ${traits} {`.trim() + ' {');
    lines.push(`    geometry: "${obj.type || 'cube'}"`);
    if (obj.position) {
      lines.push(`    position: [${obj.position.join(', ')}]`);
    }
    if (obj.color) {
      lines.push(`    color: "${obj.color}"`);
    }
    lines.push('  }');
  }

  lines.push('}');
  return lines.join('\n');
}

function convertToHsPlus(ast: any, _from: string): string {
  const lines: string[] = [];
  const objects = extractObjects(ast);

  for (const obj of objects) {
    const traits = obj.traits?.length
      ? obj.traits.map((t: string) => `  @${t.replace('@', '')}`).join('\n')
      : '';
    lines.push(`${obj.type || 'object'} ${obj.name || 'obj'} {`);
    if (traits) lines.push(traits);
    if (obj.position) {
      lines.push(`  position: [${obj.position.join(', ')}]`);
    }
    if (obj.color) {
      lines.push(`  color: "${obj.color}"`);
    }
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n').trim();
}

function convertToHs(ast: any, _from: string): string {
  const lines: string[] = [];
  const objects = extractObjects(ast);

  for (const obj of objects) {
    lines.push(`${obj.type || 'orb'} ${obj.name || 'obj'} {`);
    if (obj.position) {
      lines.push(
        `  position: { x: ${obj.position[0] || 0}, y: ${obj.position[1] || 0}, z: ${obj.position[2] || 0} }`
      );
    }
    if (obj.color) {
      lines.push(`  color: "${obj.color}"`);
    }
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n').trim();
}

function extractObjects(ast: any): any[] {
  const objects: any[] = [];

  if (!ast) return objects;

  // Handle .holo composition format
  if (ast.objects && Array.isArray(ast.objects)) {
    for (const obj of ast.objects) {
      objects.push({
        name: obj.name || obj.id,
        type: obj.type || obj.geometry || 'cube',
        position: obj.position,
        color: obj.color,
        traits: obj.traits || [],
      });
    }
  }

  // Handle .hsplus or .hs format
  if (ast.nodes && Array.isArray(ast.nodes)) {
    for (const node of ast.nodes) {
      if (node.type === 'object' || node.nodeType === 'object') {
        objects.push({
          name: node.name || node.id,
          type: node.objectType || node.geometry || 'cube',
          position: node.props?.position || node.position,
          color: node.props?.color || node.color,
          traits: node.traits || [],
        });
      }
    }
  }

  // Handle flat declaration list
  if (ast.declarations && Array.isArray(ast.declarations)) {
    for (const decl of ast.declarations) {
      objects.push({
        name: decl.name,
        type: decl.type || 'orb',
        position: decl.props?.position,
        color: decl.props?.color,
        traits: [],
      });
    }
  }

  return objects;
}

// === HELPER FUNCTIONS ===

interface AIFriendlyError {
  code: string;
  line: number;
  column?: number;
  message: string;
  context?: string;
  suggestion?: string;
  fix?: {
    type: 'replace' | 'insert' | 'delete';
    old?: string;
    new?: string;
    position?: number;
  };
}

function detectFormat(code: string): 'hs' | 'hsplus' | 'holo' {
  if (code.includes('composition') && code.includes('{')) {
    return 'holo';
  }
  if (code.includes('@') || code.includes('state {')) {
    return 'hsplus';
  }
  return 'hs';
}

function toAIFriendlyError(
  error: { message: string; line?: number; column?: number },
  code: string,
  includeSuggestions: boolean
): AIFriendlyError {
  const message = error.message;
  const line = error.line || 1;

  const aiError: AIFriendlyError = {
    code: extractErrorCode(message),
    line,
    column: error.column,
    message,
  };

  // Add context from source
  const lines = code.split('\n');
  if (line > 0 && line <= lines.length) {
    aiError.context = lines[line - 1].trim();
  }

  // Add suggestions if enabled
  if (includeSuggestions) {
    const suggestion = generateSuggestion(message);
    if (suggestion) {
      aiError.suggestion = suggestion.message;
      aiError.fix = suggestion.fix;
    }
  }

  return aiError;
}

function extractErrorCode(message: string): string {
  // Extract error code from message if present
  const match = message.match(/\[(E\d+|W\d+)\]/);
  if (match) return match[1];

  // Generate a code based on error type
  if (message.includes('Unknown trait')) return 'E001';
  if (message.includes('syntax')) return 'E002';
  if (message.includes('unexpected')) return 'E003';
  if (message.includes('missing')) return 'E004';
  return 'E999';
}

function generateSuggestion(
  message: string
): { message: string; fix?: AIFriendlyError['fix'] } | null {
  // Unknown trait
  const traitMatch = message.match(/Unknown trait:?\s*[@]?(\w+)/i);
  if (traitMatch) {
    const trait = '@' + traitMatch[1];
    const similar = findSimilarTraits(trait);
    if (similar.length > 0) {
      return {
        message: `Did you mean ${similar[0]}?`,
        fix: { type: 'replace', old: trait, new: similar[0] },
      };
    }
  }

  // Typo in geometry
  const geoMatch = message.match(/(spher|cub|cylinder|con|plan)/i);
  if (geoMatch) {
    const corrections: Record<string, string> = {
      sper: 'sphere',
      spher: 'sphere',
      cub: 'cube',
      con: 'cone',
      plan: 'plane',
    };
    const key = geoMatch[1].toLowerCase();
    if (corrections[key]) {
      return {
        message: `Did you mean '${corrections[key]}'?`,
        fix: { type: 'replace', old: geoMatch[0], new: corrections[key] },
      };
    }
  }

  return null;
}

function findSimilarTraits(trait: string): string[] {
  const normalized = trait.replace('@', '').toLowerCase();

  return ALL_TRAITS.filter((t) => {
    const tName = t.replace('@', '').toLowerCase();
    // Simple Levenshtein-like matching
    if (tName.includes(normalized) || normalized.includes(tName)) return true;
    // Check first few chars
    if (tName.substring(0, 3) === normalized.substring(0, 3)) return true;
    return false;
  }).slice(0, 3);
}

function generateExplanation(parsed: unknown, detail: string): string {
  const ast = parsed as any;
  const sections: string[] = [];

  // Overview section
  sections.push('## Overview');

  // Detect format and describe structure
  if (ast?.composition || ast?.type === 'composition') {
    sections.push('This is a **.holo** declarative composition file.');
    if (ast.name) {
      sections.push(`Composition name: **${ast.name}**`);
    }
  } else if (ast?.nodes || ast?.ast?.nodes) {
    const nodes = ast.nodes || ast.ast.nodes;
    sections.push('This is a **.hsplus** (HoloScript Plus) file with VR traits.');
    sections.push(`Contains **${nodes?.length || 0}** top-level declarations.`);
  } else {
    sections.push('This is a **.hs** (Classic HoloScript) file.');
  }

  // Environment description
  if (ast?.environment) {
    sections.push('');
    sections.push('### Environment');
    const env = ast.environment;
    if (env.skybox) sections.push(`- Skybox: **${env.skybox}**`);
    if (env.ambient_light !== undefined) sections.push(`- Ambient light: **${env.ambient_light}**`);
    if (env.theme) sections.push(`- Theme: **${env.theme}**`);
  }

  // Objects description
  const objects = extractObjectsForExplanation(ast);
  if (objects.length > 0) {
    sections.push('');
    sections.push('### Objects');

    if (detail === 'brief') {
      sections.push(`Contains **${objects.length}** objects.`);
    } else {
      for (const obj of objects.slice(0, 10)) {
        let desc = `- **${obj.name}**`;
        if (obj.type) desc += ` (${obj.type})`;
        if (obj.traits?.length) desc += ` with traits: ${obj.traits.join(', ')}`;
        sections.push(desc);
      }
      if (objects.length > 10) {
        sections.push(`... and **${objects.length - 10}** more objects.`);
      }
    }
  }

  // Traits summary
  const allTraits = new Set<string>();
  for (const obj of objects) {
    for (const trait of obj.traits || []) {
      allTraits.add(trait);
    }
  }
  if (allTraits.size > 0) {
    sections.push('');
    sections.push('### VR Traits Used');
    sections.push(Array.from(allTraits).join(', '));
  }

  // Logic/behavior summary
  if (ast?.logic || ast?.actions) {
    sections.push('');
    sections.push('### Behavior');
    sections.push('Contains event handlers and/or action definitions for interactivity.');
  }

  return sections.join('\n');
}

function extractObjectsForExplanation(ast: any): any[] {
  const objects: any[] = [];

  if (!ast) return objects;

  // Handle .holo format
  if (ast.objects && Array.isArray(ast.objects)) {
    for (const obj of ast.objects) {
      objects.push({
        name: obj.name || obj.id || 'unnamed',
        type: obj.type || obj.geometry,
        traits: obj.traits || [],
      });
    }
  }

  // Handle .hsplus/.hs format
  const nodes = ast.nodes || ast.ast?.nodes || [];
  for (const node of nodes) {
    if (node.type === 'object' || node.nodeType === 'object') {
      objects.push({
        name: node.name || node.id || 'unnamed',
        type: node.objectType || node.geometry,
        traits: node.traits || [],
      });
    }
  }

  return objects;
}

function analyzeAST(parsed: unknown, code: string) {
  const lines = code.split('\n').length;
  const objects = (code.match(/\b(orb|object|cube|sphere|model)\s+\w+/gi) || []).length;
  const traits = (code.match(/@\w+/g) || []).length;
  const functions = (code.match(/\b(function|action|on_\w+)\s*\(/gi) || []).length;

  return {
    stats: {
      lines,
      objects,
      traits,
      functions,
      characters: code.length,
    },
    complexity: {
      score: Math.min(10, Math.round((objects + traits + functions) / 5)),
      level:
        objects + traits + functions < 10
          ? 'simple'
          : objects + traits + functions < 30
            ? 'moderate'
            : 'complex',
    },
    suggestions: [
      ...(traits === 0 ? ['Consider adding VR traits for interactivity'] : []),
      ...(objects > 20 ? ['Consider using templates to reduce duplication'] : []),
      ...(lines > 200 ? ['Consider splitting into multiple composition files'] : []),
    ],
  };
}

// === TEXT-TO-3D HANDLER ===

async function handleGenerate3DObject(args: Record<string, unknown>) {
  const description = args.description as string;
  const providerName = (args.provider as string) || 'meshy';
  const style = (args.style as string) || 'pbr';
  const objectName = args.objectName as string | undefined;

  if (!description) {
    return { success: false, error: 'description is required' };
  }

  try {
    // Dynamic import to avoid loading heavy deps when not needed
    const { MeshyProvider, TripoProvider, textTo3DToHolo } = await import(
      '../../cli/src/importers/text-to-3d-importer' as string
    );

    let provider;
    if (providerName === 'tripo') {
      provider = new TripoProvider();
    } else {
      provider = new MeshyProvider();
    }

    const result = await textTo3DToHolo({
      description,
      provider,
      style: style as any,
      objectName,
    });

    return {
      success: true,
      holoCode: result.holoCode,
      holoFilePath: result.holoFilePath,
      modelFilePath: result.modelFilePath,
      traits: result.traits,
      provider: result.metadata.provider,
      generationTimeMs: result.metadata.generationTimeMs,
    };
  } catch (error: any) {
    // Check for missing API key
    if (error.message?.includes('API_KEY required')) {
      return {
        success: false,
        error: error.message,
        hint: 'Set MESHY_API_KEY or TRIPO_API_KEY in your environment',
      };
    }
    return {
      success: false,
      error: error.message || 'Text-to-3D generation failed',
    };
  }
}

// === HOLOLAND TRAINING DATA HANDLER ===

async function handleGenerateHololandTraining(args: Record<string, unknown>) {
  const variationsPerExample = (args.variations_per_example as number) ?? 4;
  const categoryFilter = (args.category as string) ?? 'all';
  const outputFile = args.output_file as string | undefined;

  let examples = generateHololandDataset(variationsPerExample);

  if (categoryFilter !== 'all') {
    examples = examples.filter((e) => e.metadata.category === (categoryFilter as TrainingCategory));
  }

  const jsonl = datasetToJsonl(examples);

  if (outputFile) {
    const { writeFileSync } = await import('fs');
    const { resolve } = await import('path');
    const filePath = resolve(process.cwd(), outputFile);
    writeFileSync(filePath, jsonl, 'utf-8');
    return {
      success: true,
      examples_count: examples.length,
      categories: [...new Set(examples.map((e) => e.metadata.category))],
      file_path: filePath,
      file_size_bytes: Buffer.byteLength(jsonl, 'utf-8'),
      message: `Generated ${examples.length} training examples → ${filePath}`,
    };
  }

  return {
    success: true,
    examples_count: examples.length,
    categories: [...new Set(examples.map((e) => e.metadata.category))],
    jsonl,
    message: `Generated ${examples.length} training examples`,
  };
}
