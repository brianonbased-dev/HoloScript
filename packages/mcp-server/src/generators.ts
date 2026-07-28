/**
 * HoloScript Code Generators
 *
 * AI-powered generation of HoloScript code from natural language.
 */

import { createProviderManager, type LLMProviderName } from '@holoscript/llm-provider';
import { parseHolo } from '@holoscript/core';
import { enforceVerifiedViewReceipts, isProvenanceComplete } from '@holoscript/core/reconstruction';
import type { HoloParseResult, HoloParseError } from '@holoscript/core';

// Inline utility — avoids an @holoscript/std peer dependency
const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Trait suggestions based on keywords
const TRAIT_KEYWORDS: Record<string, string[]> = {
  // Interaction keywords
  'pick up': ['@grabbable'],
  grab: ['@grabbable'],
  hold: ['@grabbable', '@holdable'],
  throw: ['@grabbable', '@throwable'],
  click: ['@clickable'],
  point: ['@pointable'],
  hover: ['@hoverable'],
  drag: ['@draggable'],
  scale: ['@scalable'],
  resize: ['@scalable'],

  // Physics keywords
  collide: ['@collidable'],
  bounce: ['@collidable', '@physics'],
  physics: ['@physics', '@collidable'],
  fall: ['@physics', '@gravity'],
  gravity: ['@gravity'],
  trigger: ['@trigger'],

  // Visual keywords
  glow: ['@glowing'],
  light: ['@emissive'],
  transparent: ['@transparent'],
  'see through': ['@transparent'],
  reflect: ['@reflective'],
  mirror: ['@reflective'],
  animate: ['@animated'],
  spin: ['@animated'],
  rotate: ['@animated'],
  billboard: ['@billboard'],
  'face camera': ['@billboard'],

  // Networking keywords
  multiplayer: ['@networked', '@synced'],
  sync: ['@networked', '@synced'],
  network: ['@networked'],
  save: ['@persistent'],
  persist: ['@persistent'],
  own: ['@owned'],
  host: ['@host_only'],

  // Behavior keywords
  stack: ['@stackable'],
  attach: ['@attachable'],
  equip: ['@equippable'],
  wear: ['@equippable'],
  consume: ['@consumable'],
  eat: ['@consumable'],
  drink: ['@consumable'],
  destroy: ['@destructible'],
  break: ['@destructible'],

  // Spatial keywords
  anchor: ['@anchor'],
  track: ['@tracked'],
  'world lock': ['@world_locked'],
  'hand track': ['@hand_tracked'],
  'eye track': ['@eye_tracked'],

  // Audio keywords
  sound: ['@spatial_audio'],
  audio: ['@spatial_audio'],
  ambient: ['@ambient'],
  voice: ['@voice_activated'],
  speak: ['@voice_activated'],

  // State keywords
  state: ['@state', '@reactive'],
  react: ['@reactive'],
  observe: ['@observable'],
  compute: ['@computed'],

  // Social keywords
  share: ['@shareable'],
  collaborate: ['@collaborative'],
  tweet: ['@tweetable'],
};

// Universal v6 trait keywords mapped by domain
const UNIVERSAL_TRAIT_KEYWORDS: Record<string, { traits: string[]; domain: string }> = {
  // Service domain
  api: { traits: ['@service', '@endpoint', '@rest_resource'], domain: 'service' },
  endpoint: { traits: ['@endpoint', '@route'], domain: 'service' },
  route: { traits: ['@route', '@handler'], domain: 'service' },
  rest: { traits: ['@rest_resource', '@endpoint'], domain: 'service' },
  'http server': { traits: ['@service', '@endpoint', '@handler'], domain: 'service' },
  middleware: { traits: ['@middleware'], domain: 'service' },
  gateway: { traits: ['@api_gateway', '@ingress'], domain: 'service' },
  proxy: { traits: ['@reverse_proxy'], domain: 'service' },
  'load balance': { traits: ['@load_balancer'], domain: 'service' },
  webhook: { traits: ['@webhook_receiver', '@webhook_sender'], domain: 'service' },
  'graphql resolver': { traits: ['@graphql_resolver', '@service'], domain: 'service' },
  cors: { traits: ['@cors_policy'], domain: 'service' },
  'rate limit': { traits: ['@rate_limiter'], domain: 'service' },
  'file upload': { traits: ['@file_upload', '@multipart_handler'], domain: 'service' },
  sse: { traits: ['@sse_endpoint'], domain: 'service' },
  batch: { traits: ['@batch_endpoint'], domain: 'service' },
  rpc: { traits: ['@rpc_method', '@service'], domain: 'service' },
  'health endpoint': { traits: ['@health_endpoint', '@service'], domain: 'service' },

  // Contract domain
  schema: { traits: ['@schema', '@contract'], domain: 'contract' },
  validate: { traits: ['@validator', '@contract'], domain: 'contract' },
  serialize: { traits: ['@serializer'], domain: 'contract' },
  openapi: { traits: ['@openapi_path', '@openapi_response'], domain: 'contract' },
  protobuf: { traits: ['@protobuf_message', '@serializer'], domain: 'contract' },
  asyncapi: { traits: ['@asyncapi_channel', '@asyncapi_message'], domain: 'contract' },
  'graphql type': { traits: ['@graphql_type', '@contract'], domain: 'contract' },
  'json schema': { traits: ['@json_schema'], domain: 'contract' },
  avro: { traits: ['@avro_schema', '@serializer'], domain: 'contract' },
  dto: { traits: ['@dto', '@data_transformer'], domain: 'contract' },
  'contract test': { traits: ['@contract_test', '@consumer_contract'], domain: 'contract' },
  'schema evolution': { traits: ['@schema_evolution', '@backward_compatible'], domain: 'contract' },
  sanitize: { traits: ['@input_sanitizer', '@output_filter'], domain: 'contract' },

  // Data domain
  database: { traits: ['@db', '@model', '@query'], domain: 'data' },
  model: { traits: ['@model', '@db'], domain: 'data' },
  query: { traits: ['@query', '@db'], domain: 'data' },
  cache: { traits: ['@cache'], domain: 'data' },
  migration: { traits: ['@migration', '@db'], domain: 'data' },
  orm: { traits: ['@model', '@repository', '@data_mapper'], domain: 'data' },
  repository: { traits: ['@repository', '@model'], domain: 'data' },
  transaction: { traits: ['@transaction', '@db'], domain: 'data' },
  cqrs: { traits: ['@cqrs_command', '@cqrs_query'], domain: 'data' },
  'event store': { traits: ['@event_store', '@projection'], domain: 'data' },
  postgres: { traits: ['@relational_db', '@db'], domain: 'data' },
  mongodb: { traits: ['@document_db', '@db'], domain: 'data' },
  redis: { traits: ['@key_value_store', '@cache'], domain: 'data' },
  'full text search': { traits: ['@full_text_search', '@search_index'], domain: 'data' },
  'vector db': { traits: ['@vector_db', '@search_index'], domain: 'data' },
  paginate: { traits: ['@cursor_pagination'], domain: 'data' },
  'soft delete': { traits: ['@soft_delete', '@audit_column'], domain: 'data' },
  sharding: { traits: ['@sharding_key', '@db'], domain: 'data' },

  // Network domain
  websocket: { traits: ['@websocket'], domain: 'network' },
  grpc: { traits: ['@grpc'], domain: 'network' },
  graphql: { traits: ['@graphql'], domain: 'network' },
  tcp: { traits: ['@tcp_server', '@tcp_client'], domain: 'network' },
  tls: { traits: ['@tls_config'], domain: 'network' },
  mtls: { traits: ['@mtls_config', '@tls_config'], domain: 'network' },
  oauth: { traits: ['@oauth2_config'], domain: 'network' },
  jwt: { traits: ['@jwt_config', '@jwt_verifier'], domain: 'network' },
  session: { traits: ['@session_config'], domain: 'network' },
  cdn: { traits: ['@cdn_config'], domain: 'network' },

  // Pipeline domain
  pipeline: { traits: ['@pipeline', '@stream'], domain: 'pipeline' },
  stream: { traits: ['@stream', '@real_time_stream'], domain: 'pipeline' },
  queue: { traits: ['@queue', '@worker'], domain: 'pipeline' },
  worker: { traits: ['@worker', '@queue'], domain: 'pipeline' },
  scheduler: { traits: ['@scheduler'], domain: 'pipeline' },
  etl: { traits: ['@etl_pipeline', '@pipeline'], domain: 'pipeline' },
  kafka: { traits: ['@message_broker', '@topic', '@subscription'], domain: 'pipeline' },
  rabbitmq: { traits: ['@message_broker', '@queue'], domain: 'pipeline' },
  'message broker': { traits: ['@message_broker', '@topic'], domain: 'pipeline' },
  'dead letter': { traits: ['@dlq_handler', '@queue'], domain: 'pipeline' },
  'event sourcing': { traits: ['@event_sourcing', '@message_broker'], domain: 'pipeline' },
  workflow: { traits: ['@workflow_engine', '@state_machine'], domain: 'pipeline' },
  saga: { traits: ['@saga_orchestrator', '@compensating_transaction'], domain: 'pipeline' },
  cdc: { traits: ['@change_data_capture', '@stream'], domain: 'pipeline' },
  fanout: { traits: ['@fanout', '@message_broker'], domain: 'pipeline' },

  // Metric domain
  metric: { traits: ['@metric', '@prometheus_exporter'], domain: 'metric' },
  trace: { traits: ['@trace', '@span', '@trace_context'], domain: 'metric' },
  tracing: { traits: ['@trace', '@span', '@trace_context'], domain: 'metric' },
  log: { traits: ['@log', '@structured_log'], domain: 'metric' },
  'health check': { traits: ['@health_check'], domain: 'metric' },
  prometheus: { traits: ['@prometheus_exporter', '@metric'], domain: 'metric' },
  grafana: { traits: ['@grafana_dashboard', '@metric'], domain: 'metric' },
  alert: { traits: ['@alert_rule', '@alert_channel'], domain: 'metric' },
  slo: { traits: ['@slo', '@sli', '@error_budget'], domain: 'metric' },
  apm: { traits: ['@apm_agent', '@profiler'], domain: 'metric' },
  monitoring: { traits: ['@availability_monitor', '@uptime_monitor'], domain: 'metric' },
  'audit log': { traits: ['@audit_log', '@access_log'], domain: 'metric' },
  telemetry: { traits: ['@metric', '@trace', '@log'], domain: 'metric' },

  // Container domain
  container: { traits: ['@container', '@dockerfile'], domain: 'container' },
  docker: { traits: ['@dockerfile', '@docker_compose'], domain: 'container' },
  kubernetes: { traits: ['@kubernetes_deployment', '@kubernetes_service'], domain: 'container' },
  k8s: { traits: ['@kubernetes_deployment', '@kubernetes_service'], domain: 'container' },
  deployment: { traits: ['@deployment', '@scaling'], domain: 'container' },
  'auto scale': { traits: ['@scaling', '@kubernetes_hpa'], domain: 'container' },
  helm: { traits: ['@helm_chart', '@helm_values'], domain: 'container' },
  terraform: { traits: ['@terraform_resource', '@terraform_module'], domain: 'container' },
  'config map': { traits: ['@kubernetes_configmap'], domain: 'container' },
  secret: { traits: ['@secret'], domain: 'container' },
  cronjob: { traits: ['@kubernetes_cronjob'], domain: 'container' },
  ingress: { traits: ['@kubernetes_ingress'], domain: 'container' },

  // Resilience domain
  'circuit breaker': { traits: ['@circuit_breaker'], domain: 'resilience' },
  retry: { traits: ['@retry', '@exponential_backoff'], domain: 'resilience' },
  timeout: { traits: ['@timeout', '@deadline_propagation'], domain: 'resilience' },
  fallback: { traits: ['@fallback', '@graceful_degradation'], domain: 'resilience' },
  bulkhead: { traits: ['@bulkhead'], domain: 'resilience' },
  backoff: { traits: ['@exponential_backoff', '@jitter_backoff'], domain: 'resilience' },
  'rate limiting': { traits: ['@token_bucket', '@leaky_bucket'], domain: 'resilience' },
  'load shedding': { traits: ['@load_shedding', '@adaptive_concurrency'], domain: 'resilience' },
  'chaos engineering': { traits: ['@chaos_experiment', '@fault_injection'], domain: 'resilience' },
  canary: { traits: ['@canary_release'], domain: 'resilience' },
  'blue green': { traits: ['@blue_green_deploy'], domain: 'resilience' },
  idempotent: { traits: ['@idempotency_key', '@idempotent_consumer'], domain: 'resilience' },

  // Visual/material domain — realistic rendering, PBR materials, named presets
  realistic: { traits: ['@advanced_pbr', '@material_preset'], domain: 'visual' },
  material: { traits: ['@advanced_pbr', '@material_preset'], domain: 'visual' },
  texture: { traits: ['@advanced_pbr'], domain: 'visual' },
  pbr: { traits: ['@advanced_pbr'], domain: 'visual' },
  lighting: { traits: ['@advanced_pbr', '@emissive'], domain: 'visual' },
  glow: { traits: ['@material_preset', '@emissive'], domain: 'visual' },
  subsurface: { traits: ['@advanced_pbr'], domain: 'visual' },
  weathered: { traits: ['@material_preset'], domain: 'visual' },
};

// Geometry keywords
const GEOMETRY_KEYWORDS: Record<string, string> = {
  cube: 'cube',
  box: 'cube',
  sphere: 'sphere',
  ball: 'sphere',
  orb: 'sphere',
  cylinder: 'cylinder',
  tube: 'cylinder',
  pipe: 'cylinder',
  cone: 'cone',
  pyramid: 'cone',
  torus: 'torus',
  ring: 'torus',
  donut: 'torus',
  capsule: 'capsule',
  pill: 'capsule',
  plane: 'plane',
  floor: 'plane',
  ground: 'plane',
  wall: 'plane',
};

// Color keywords
const COLOR_KEYWORDS: Record<string, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  yellow: '#ffff00',
  orange: '#ff8800',
  purple: '#8800ff',
  pink: '#ff88ff',
  white: '#ffffff',
  black: '#000000',
  gray: '#888888',
  grey: '#888888',
  gold: '#ffd700',
  silver: '#c0c0c0',
};

// Material preset keywords — named, referenceable @advanced_pbr presets (OpenUSD
// "Look" pattern, see research/2026-07-03_holoscript-realistic-authoring-docs-PLAN.md
// §4). Maps a material-flavored description keyword to a PRESET IDENTIFIER, never a
// raw hand-derived hex/roughness/metallic value — the identifier is composed onto the
// generated object as `@material_preset("<identifier>")` in generateObject() below.
const MATERIAL_PRESET_KEYWORDS: Record<string, string> = {
  weathered: 'weathered_stone',
  stone: 'weathered_stone',
  rock: 'weathered_stone',
  metal: 'brushed_metal',
  metallic: 'brushed_metal',
  wood: 'polished_wood',
  wooden: 'polished_wood',
  glowing: 'bioluminescent_glow',
  bioluminescent: 'bioluminescent_glow',
  organic: 'organic_moss',
  moss: 'organic_moss',
  glass: 'frosted_glass',
  fabric: 'woven_fabric',
  cloth: 'woven_fabric',
  rusty: 'oxidized_metal',
  rust: 'oxidized_metal',
};

interface GenerateOptions {
  format?: 'hs' | 'hsplus' | 'holo';
  includeDocs?: boolean;
}

interface SceneOptions {
  style?: 'minimal' | 'detailed' | 'production';
  features?: string[];
}

interface AIGenerationMetadata {
  source?: 'ai' | 'heuristic';
  provider?: LLMProviderName;
  attemptedProviders?: LLMProviderName[];
}

// F.112: generation is SOVEREIGN-default. Sovereign serving (Brittney Cloud =
// vast Ollama/PyWorker fleet P.008, or a local Ollama/llama.cpp/bitnet server) is
// tried FIRST; frontier APIs (Anthropic/OpenAI/Gemini) are BYOK fallback ONLY.
// HOLOSCRIPT_MCP_AI_PROVIDER still force-pins for explicit overrides. NOTE: this is
// necessary-but-not-sufficient — a sovereign provider must also be REGISTERED, which
// needs BRITTNEY_SERVICE_URL / HOLOSCRIPT_LOCAL_LLM_URL set in the mcp-server env
// (Railway dashboard); without one, anthropic-BYOK fallback is correct behavior.
const AI_PROVIDER_PRIORITY: readonly LLMProviderName[] = [
  'brittney-cloud', // sovereign serving fleet (BRITTNEY_SERVICE_URL) — native default
  'local-llm', // local Ollama / llama.cpp / LM Studio (HOLOSCRIPT_LOCAL_LLM_URL)
  'bitnet', // dedicated bitnet.cpp server (HOLOSCRIPT_BITNET_URL)
  'anthropic', // BYOK frontier fallback
  'openai',
  'gemini',
  'mock',
];

function getAIProviderOrder(registeredProviders: LLMProviderName[]): LLMProviderName[] {
  const forcedProvider = process.env.HOLOSCRIPT_MCP_AI_PROVIDER as LLMProviderName | undefined;

  if (forcedProvider && registeredProviders.includes(forcedProvider)) {
    return [
      forcedProvider,
      ...AI_PROVIDER_PRIORITY.filter(
        (provider) => provider !== forcedProvider && registeredProviders.includes(provider)
      ),
    ];
  }

  return AI_PROVIDER_PRIORITY.filter((provider) => registeredProviders.includes(provider));
}

function detectGeometryFromCode(code: string): string | undefined {
  const geometryMatch = code.match(/geometry:\s*"([^"]+)"/i);
  if (geometryMatch) return geometryMatch[1];

  const primitiveMatch = code.match(
    /\b(cube|sphere|cylinder|cone|torus|capsule|plane|mesh|text|light|camera)\b/
  );
  return primitiveMatch?.[1];
}

function isUsableObjectCode(code: string, format: 'hs' | 'hsplus' | 'holo'): boolean {
  if (!code.trim()) return false;
  if ((code.match(/\{/g) || []).length !== (code.match(/\}/g) || []).length) return false;

  if (format === 'holo') {
    return code.includes('template ') || code.includes('object ');
  }

  return (
    code.includes('composition ') ||
    code.includes('template ') ||
    code.includes('object ') ||
    code.includes('material ') ||
    /\b(cube|sphere|plane|cylinder|cone|torus|capsule)\b/.test(code)
  );
}

function isUsableSceneCode(code: string): boolean {
  if (!code.trim()) return false;
  if ((code.match(/\{/g) || []).length !== (code.match(/\}/g) || []).length) return false;

  // Accept both named (composition "Foo" {) and unnamed (composition {) roots
  const hasCompositionRoot = /\bcomposition(?:\s+"[^"]*")?\s*\{/i.test(code);
  const hasSceneContent =
    code.includes('environment') ||
    code.includes('object ') ||
    code.includes('template ') ||
    /\b(cube|sphere|plane|cylinder|cone|torus|capsule|mesh|text|light|camera)\s*\{/i.test(code);

  return hasCompositionRoot && hasSceneContent;
}

function stripCodeFences(code: string): string {
  const fenced = code.match(/```(?:holoscript|holo|hsplus|hs)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : code).trim();
}

function trimToLikelyCodeStart(code: string): string {
  const marker = code.search(
    /(^|\n)\s*(composition\s*(?:"[^"]*"\s*)?\{|template\s+"|object\s+"|cube\s*\{|sphere\s*\{|plane\s*\{|cylinder\s*\{|cone\s*\{|torus\s*\{|capsule\s*\{|mesh\s*\{)/i
  );

  if (marker < 0) return code.trim();

  const start = code.lastIndexOf('\n', marker);
  return code.slice(start >= 0 ? start + 1 : marker).trim();
}

function indentBlock(code: string, spaces = 2): string {
  const indent = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function wrapSceneFragment(fragment: string): string {
  return `composition "GeneratedScene" {
  environment {
    skybox: "gradient"
    ambient_light: 0.3
  }

${indentBlock(fragment, 2)}
}`;
}

function normalizeSceneAIOutput(code: string): string {
  const stripped = stripCodeFences(code);
  const trimmed = trimToLikelyCodeStart(stripped);

  if (!trimmed) return trimmed;
  // Accept both named (composition "Foo" {) and unnamed (composition {) roots
  if (/^composition\s*(?:"[^"]*"\s*)?\{/i.test(trimmed)) return trimmed;

  const looksLikeSceneFragment =
    isUsableObjectCode(trimmed, 'holo') ||
    /\b(cube|sphere|plane|cylinder|cone|torus|capsule|mesh)\s*\{/i.test(trimmed);

  if (!looksLikeSceneFragment) return trimmed;

  return wrapSceneFragment(trimmed);
}

/**
 * Deterministically repair the parser-fatal patterns LLM generators emit, so the
 * output compiles through the compiler MCP path. Proven against compile_to_r3f /
 * compile_to_native_2d / compile_to_canvas2d_game (a named composition with quoted
 * hex compiles green; the raw LLM forms below are rejected by the parser):
 *   (a) anonymous `composition {`                  -> `composition "GeneratedScene" {`
 *   (b) bare hex args `@color(#abc)` / `c: #abc` / `(1, #abc)` -> quoted string
 *   (c) `=` assignment in trait args `@t(w = 5)`   -> `@t(w: 5)` (HoloScript uses `:`)
 *   (d) unquoted dotted value `c: theme.primary`   -> `c: "theme.primary"` (outside bind())
 * Idempotent: already-valid output (named composition, quoted colors, `:` separators,
 * bind(...) expressions) passes through unchanged. A fifth class — generator-emitted
 * unsupported primitives (`light{}`) / niche traits — is tracked separately; the exact
 * offending token must be confirmed before stripping, to avoid removing valid
 * root-level lighting.
 */
export function normalizeGeneratedHoloScript(
  code: string,
  _targetFormat: 'hs' | 'hsplus' | 'holo'
): string {
  let out = code;
  // (a) name an anonymous composition root (does NOT touch `composition "X" {`)
  out = out.replace(/\bcomposition\s*\{/g, 'composition "GeneratedScene" {');
  // (b) quote bare #hex used as a value, after `(`, `,` or `:` (skips already-quoted)
  out = out.replace(/([(,]\s*|:\s*)(#[0-9a-fA-F]{3,8})\b/g, (_m, lead, hex) => `${lead}"${hex}"`);
  // (c) `key = value` -> `key: value` in arg/property position only. The LLM tail
  //     emits `@trait(width = 5)` / a `key = value` property line; HoloScript uses `:`.
  //     Scoped to an identifier key in arg position (after `(` or `,`) OR at the start
  //     of a (whitespace-only-indented) line, then a LONE `=` — guarded against `==`,
  //     `=>`, `>=`, `<=`, `!=` so any equality/arrow inside a bind()/when() expression
  //     or a skipped action body is left untouched.
  out = out.replace(
    /([(,]\s*|^[ \t]*)([A-Za-z_$][\w$]*)\s*=(?![=>])\s*/gm,
    (_m, lead, key) => `${lead}${key}: `
  );
  // (d) quote an unquoted dotted value `key: a.b(.c)` -> `key: "a.b"`, e.g.
  //     `color: theme.primary`. Skips: already-quoted, numeric (1.5 — leading digit not
  //     matched), and bind()/expression contexts (a dotted path immediately followed by
  //     `(` is a call, excluded by the negative lookahead).
  out = out.replace(
    /(:\s*)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)(?!\s*[("'.\w])/g,
    (_m, lead, path) => `${lead}"${path}"`
  );
  return out;
}

/** Max generate->parse->re-prompt attempts per provider before falling to the next. */
const MAX_GEN_RETRIES_PER_PROVIDER = Math.max(
  1,
  Number(process.env.HOLOSCRIPT_MCP_GEN_RETRIES) || 2
);

/**
 * Validate raw LLM output against the canonical parser, mirroring the normalization
 * the caller will ultimately apply, so a "valid" verdict here means the string that
 * actually reaches the compiler parses. Returns the deterministically-repaired code
 * plus a parse verdict and a compact error summary suitable for re-prompting.
 *
 * Scene/UI callers run normalizeSceneAIOutput AFTER tryGenerateWithAI; objects do not.
 * We replicate that here (idempotent on already-wrapped input) only to validate — the
 * returned `code` is the same raw-normalized shape the caller expects, so contracts
 * are unchanged.
 */
function validateGeneratedCode(
  rawCode: string,
  targetFormat: 'hs' | 'hsplus' | 'holo'
): { code: string; ok: boolean; errorSummary: string } {
  const code = normalizeGeneratedHoloScript(rawCode, targetFormat);
  // The string the caller hands to the compiler: scene/UI paths wrap fragments.
  const toParse = targetFormat === 'holo' ? normalizeSceneAIOutput(code) : code;

  if (!toParse.trim()) {
    return { code, ok: false, errorSummary: 'empty generation' };
  }

  // Structural gate: the parser is TOLERANT — it accepts arbitrary non-HoloScript text
  // as an empty implicit composition (success:true, no content). So a parse-success
  // verdict alone is insufficient; require a real composition/object/template root too.
  // This is the existing usability heuristic, now ANDed with a true parse.
  const structurallyUseful =
    targetFormat === 'holo'
      ? isUsableSceneCode(toParse)
      : isUsableObjectCode(toParse, targetFormat);
  if (!structurallyUseful) {
    return {
      code,
      ok: false,
      errorSummary: 'no composition root with renderable content (empty or non-HoloScript output)',
    };
  }

  let result: HoloParseResult;
  try {
    result = parseHolo(toParse) as HoloParseResult;
  } catch (err) {
    return {
      code,
      ok: false,
      errorSummary: err instanceof Error ? err.message : String(err),
    };
  }

  if (result.success) {
    return { code, ok: true, errorSummary: '' };
  }

  const errorSummary = result.errors
    .slice(0, 4)
    .map((e: HoloParseError) => {
      const where = e.loc ? ` (line ${e.loc.line}, col ${e.loc.column})` : '';
      const hint = e.suggestion ? ` — ${e.suggestion}` : '';
      return `${e.message}${where}${hint}`;
    })
    .join('; ');

  return { code, ok: false, errorSummary: errorSummary || 'parse failed' };
}

/** Re-prompt suffix appended after a failed parse, steering the model to the grammar. */
function buildRetryPrompt(basePrompt: string, errorSummary: string): string {
  return `${basePrompt}

Your previous output FAILED to parse with these errors:
${errorSummary}

Fix ONLY these problems and return corrected HoloScript. Grammar reminders:
- separate keys and values with a colon, never '=' (write \`width: 5\`, not \`width = 5\`)
- quote string values, including dotted refs like \`"theme.primary"\`, unless inside bind(...)
- the root must be a named composition: \`composition "Name" { ... }\`
- colors are quoted strings: \`"#3366ff"\`
Return only code, no prose.`;
}

async function tryGenerateWithAI(
  prompt: string,
  targetFormat: 'hs' | 'hsplus' | 'holo'
): Promise<{
  code: string;
  provider: LLMProviderName;
  attemptedProviders: LLMProviderName[];
  detectedTraits: string[];
} | null> {
  let manager;

  try {
    manager = createProviderManager();
  } catch {
    return null;
  }

  const debugAI = process.env.HOLOSCRIPT_MCP_AI_DEBUG === '1';
  const attemptedProviders: LLMProviderName[] = [];
  // Best parser-rejected candidate seen so far — returned only if NO provider yields a
  // parse-clean result, preserving the prior behavior (the caller's isUsable*/heuristic
  // fallback still runs on it). The deterministic generator remains the final net.
  let lastCandidate: {
    code: string;
    provider: LLMProviderName;
    detectedTraits: string[];
  } | null = null;

  for (const providerName of getAIProviderOrder(manager.getRegisteredProviders())) {
    const provider = manager.getProvider(providerName);
    if (!provider) continue;

    attemptedProviders.push(providerName);

    // Local providers (small models) need conservative settings to stay coherent
    const isLocalProvider = providerName === 'bitnet' || providerName === 'local-llm';
    let attemptPrompt = prompt;

    for (let attempt = 1; attempt <= MAX_GEN_RETRIES_PER_PROVIDER; attempt++) {
      let result;
      try {
        result = await provider.generateHoloScript({
          prompt: attemptPrompt,
          targetFormat,
          maxObjects: targetFormat === 'holo' ? (isLocalProvider ? 4 : 8) : 1,
          // Nudge temperature down on retry so the repair stays close to the grammar.
          temperature: (isLocalProvider ? 0.1 : 0.35) * (attempt > 1 ? 0.6 : 1),
        });
      } catch {
        // Provider call failed entirely — abandon this provider, try the next.
        break;
      }

      const verdict = validateGeneratedCode(result.code, targetFormat);

      if (verdict.ok) {
        if (debugAI && attempt > 1) {
          console.debug(
            `[generators] ${providerName} produced parse-clean output on attempt ${attempt}`
          );
        }
        return {
          code: verdict.code,
          provider: result.provider,
          attemptedProviders: [...attemptedProviders],
          detectedTraits: result.detectedTraits,
        };
      }

      // Keep the most recent rejected candidate as a last resort.
      lastCandidate = {
        code: verdict.code,
        provider: result.provider,
        detectedTraits: result.detectedTraits,
      };

      if (debugAI) {
        console.debug(
          `[generators] ${providerName} attempt ${attempt}/${MAX_GEN_RETRIES_PER_PROVIDER} failed parse: ${verdict.errorSummary}`
        );
      }

      // Re-prompt the SAME provider with the concrete parse error (if attempts remain).
      attemptPrompt = buildRetryPrompt(prompt, verdict.errorSummary);
    }
    // Exhausted retries for this provider; fall through to the next provider.
  }

  // No provider produced parse-clean output. Return the best rejected candidate (if any)
  // so the caller's usability heuristic + deterministic fallback path behaves as before.
  if (lastCandidate) {
    return {
      code: lastCandidate.code,
      provider: lastCandidate.provider,
      attemptedProviders: [...attemptedProviders],
      detectedTraits: lastCandidate.detectedTraits,
    };
  }

  return null;
}

export async function generateObjectForMCP(
  description: string,
  options: GenerateOptions = {}
): Promise<ReturnType<typeof generateObject> & AIGenerationMetadata> {
  const format = options.format || 'hsplus';
  const heuristic = generateObject(description, options);
  const aiPrompt = `Create a single ${format} HoloScript object for: ${description}. Return only code. Prefer one focused object, not a large world.`;
  const aiResult = await tryGenerateWithAI(aiPrompt, format);

  if (aiResult && isUsableObjectCode(aiResult.code, format)) {
    return {
      code: aiResult.code,
      traits: aiResult.detectedTraits,
      geometry: detectGeometryFromCode(aiResult.code) ?? heuristic.geometry,
      format,
      source: 'ai',
      provider: aiResult.provider,
      attemptedProviders: aiResult.attemptedProviders,
    };
  }

  return {
    ...heuristic,
    source: 'heuristic',
    provider: aiResult?.provider,
    attemptedProviders: aiResult?.attemptedProviders,
  };
}

export async function generateSceneForMCP(
  description: string,
  options: SceneOptions = {}
): Promise<ReturnType<typeof generateScene> & AIGenerationMetadata> {
  const debugAI = process.env.HOLOSCRIPT_MCP_AI_DEBUG === '1';
  const heuristic = generateScene(description, options);
  const features = options.features?.length
    ? ` Include features: ${options.features.join(', ')}.`
    : '';
  const aiPrompt = `Create a complete holo composition scene for: ${description}.${features} Return only code with a composition root.`;
  const aiResult = await tryGenerateWithAI(aiPrompt, 'holo');
  const aiCode = aiResult ? normalizeSceneAIOutput(aiResult.code) : '';

  if (aiResult && isUsableSceneCode(aiCode)) {
    return {
      code: aiCode,
      stats: {
        objects: (aiCode.match(/\bobject\s+"/g) || []).length,
        traits: aiResult.detectedTraits.length,
        lines: aiCode.split('\n').length,
      },
      source: 'ai',
      provider: aiResult.provider,
      attemptedProviders: aiResult.attemptedProviders,
    };
  }

  const fallback = {
    ...heuristic,
    source: 'heuristic',
    provider: aiResult?.provider,
    attemptedProviders: aiResult?.attemptedProviders,
  };

  if (debugAI && aiResult) {
    Object.assign(fallback, {
      aiDebug: {
        rawCode: aiResult.code,
        normalizedCode: aiCode,
        balanced: (aiCode.match(/\{/g) || []).length === (aiCode.match(/\}/g) || []).length,
        hasCompositionRoot: /\bcomposition(?:\s+"[^"]+")?\s*\{/i.test(aiCode),
        hasSceneContent:
          aiCode.includes('environment') ||
          aiCode.includes('object ') ||
          aiCode.includes('template ') ||
          /\b(cube|sphere|plane|cylinder|cone|torus|capsule|mesh|text|light|camera)\s*\{/i.test(
            aiCode
          ),
      },
    });
  }

  return fallback as any;
}

// =============================================================================
// NATIVE WORLD GENERATION — sovereign-3d pipeline (Brittney v43+)
// =============================================================================

export interface NativeWorldGenerationOptions {
  /** Output format. neural_field is the sovereign-exclusive format. Default: '3dgs' */
  format?: 'mesh' | '3dgs' | 'both' | 'neural_field';
  /** Quality tier. Default: 'high' */
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  /** Optional base64 or URL for single-view reconstruction */
  input_image?: string;
  /** Multi-view images for photogrammetric reconstruction */
  input_images?: string[];
  /** Generate a navigable navmesh alongside the world asset */
  navEnabled?: boolean;
  /** Enable physics + collision interactive mode */
  interactiveMode?: boolean;
  /** Reproducible seed */
  seed?: number;
}

export interface NativeWorldGenerationResult {
  /**
   * Primary asset URL (.splat / .ply / .glb).
   * Absent when source='text-llm' — the sovereign 3D backend is not yet deployed;
   * holoCode is still valid HoloScript that can be rendered as a scene.
   */
  assetUrl?: string;
  /** Navmesh .glb URI — present when navEnabled=true and source='sovereign-3d' */
  navmeshUrl?: string;
  /** Point cloud URI — present when format='both' and source='sovereign-3d' */
  pointCloudUrl?: string;
  /** Opaque backend job ID — absent when source='text-llm' */
  generationId?: string;
  /** Format actually produced */
  format: string;
  /** Auto-generated companion HoloScript code (.holo) */
  holoCode: string;
  /**
   * Generation surface used.
   * - 'sovereign-3d'  — Sovereign3DAdapter (Brittney v43+ 3D splat backend), live asset URL present
   * - 'text-llm'      — Brittney/LLM text path (same as generate_scene), no 3D asset yet
   * - 'heuristic'     — deterministic fallback, no LLM available
   */
  source: 'sovereign-3d' | 'text-llm' | 'heuristic';
  metrics: {
    splatCount?: number;
    triangleCount?: number;
    generationMs?: number;
    bounds?: [number, number, number, number, number, number];
    agentStart?: [number, number, number];
    waypoints?: [number, number, number][];
  };
}

export type WorldPromptInputType = 'text' | 'image' | 'video';

export interface WorldPromptInput {
  type: WorldPromptInputType;
  text?: string;
  url?: string;
  data?: string;
  mimeType?: string;
  label?: string;
}

export interface VideoReconstructionSummary {
  sessionId: string;
  replayFingerprint?: string;
  framesIngested?: number;
  ingestMode?: string;
  captureProfile?: string;
  videoBytes?: number;
}

export interface WorldSemanticNode {
  id: string;
  name: string;
  kind: 'terrain' | 'landmark' | 'video_reconstruction' | 'agent_start';
  geometry: 'plane' | 'box' | 'capsule' | 'mesh';
  position: [number, number, number];
  scale: [number, number, number];
  material: string;
}

export interface WorldColliderMesh {
  id: string;
  nodeId: string;
  shape: 'box' | 'mesh';
  position: [number, number, number];
  size: [number, number, number];
  source: 'semantic_node' | 'video_reconstruction' | 'navmesh';
}

export type WorldAssetGraphNodeKind =
  | 'terrain'
  | 'landmark'
  | 'surface'
  | 'semantic_observation'
  | 'occluder_completion'
  | 'navigation_path'
  | 'agent_start'
  | 'video_reconstruction';

export type WorldAssetGraphProvenance = 'observed' | 'inferred' | 'completed' | 'generated';

export interface WorldAssetGraphNode {
  id: string;
  name: string;
  kind: WorldAssetGraphNodeKind;
  geometry: 'plane' | 'box' | 'capsule' | 'mesh';
  position: [number, number, number];
  scale: [number, number, number];
  material: string;
  provenance: WorldAssetGraphProvenance;
  confidence: number;
  sourceInputLabels: string[];
  sourceNodeIds: string[];
  traits: string[];
  navigationRole?: 'walkable' | 'spawn' | 'target' | 'path';
  colliderRole?: 'static' | 'dynamic' | 'navmesh';
}

export interface WorldAssetGraphEdge {
  id: string;
  from: string;
  to: string;
  relationship:
    | 'supports'
    | 'blocks'
    | 'leads_to'
    | 'occludes'
    | 'completes'
    | 'anchors'
    | 'observes';
  confidence: number;
}

export interface WorldStructuredAssetGraph {
  schema: 'holoscript.structured_asset_graph.v1';
  graphId: string;
  graphHash: string;
  sourcePromptHash: string;
  inputModalities: WorldPromptInputType[];
  nodes: WorldAssetGraphNode[];
  edges: WorldAssetGraphEdge[];
  navigationPath: [number, number, number][];
  colliderMeshIds: string[];
  occlusionCompletions: string[];
  materialAtlas: Record<string, string>;
  textureMapRefs: string[];
  matrixRefs: string[];
  benchmarkBoundary: 'marble_gap_sovereign_structured_asset_graph';
}

export interface WorldFoundationModelProvenance {
  schema: 'cael.world_foundation_model.v1';
  synthesisId: string;
  provider: string;
  model: string;
  generatedAt: string;
  promptHash: string;
  inputModalities: WorldPromptInputType[];
  semanticNodeCount: number;
  colliderCount: number;
  videoReconstructionSessionId?: string;
  replayFingerprint?: string;
  sourceAssetUrls: string[];
  structuredAssetGraphHash?: string;
  structuredAssetGraphNodeCount?: number;
  occlusionCompletionCount?: number;
  receiptHash: string;
}

export interface WorldPromptGenerationOptions extends NativeWorldGenerationOptions {
  inputs?: WorldPromptInput[];
  videoReconstruction?: VideoReconstructionSummary;
  provider?: string;
  model?: string;
  generatedAt?: string;
}

export interface WorldPromptGenerationResult extends NativeWorldGenerationResult {
  inputModalities: WorldPromptInputType[];
  semanticNodes: WorldSemanticNode[];
  colliderMeshes: WorldColliderMesh[];
  structuredAssetGraph: WorldStructuredAssetGraph;
  provenance: WorldFoundationModelProvenance;
  videoReconstruction?: VideoReconstructionSummary;
}

/**
 * Generate a sovereign 3D world using the native Sovereign3DAdapter (Brittney v43+)
 * when the 3D backend is deployed, or the proven Brittney text-LLM path when it is not.
 *
 * Resolution order:
 *   1. Sovereign3DAdapter — only when HOLOSCRIPT_SOVEREIGN_BASE_URL is explicitly set
 *      (proves the backend is deployed; default 'https://api.holoscript.net/sovereign'
 *      is intentionally NOT treated as "available" — that endpoint is not deployed).
 *   2. tryGenerateWithAI text path — Brittney cloud / local-llm / BYOK; same mechanism
 *      as generate_scene.  Returns a real .holo world composition; no 3D splat asset.
 *   3. Heuristic fallback — deterministic, no LLM needed.
 *
 * This is an honest capability-gap posture (per /founder ruling 2026-06-08):
 * the tool succeeds with real output, source field declares which surface was used,
 * and assetUrl is absent when the 3D backend is not yet deployed.
 */
export async function generateWorldNative(
  prompt: string,
  options: NativeWorldGenerationOptions = {}
): Promise<NativeWorldGenerationResult> {
  const safePrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
  const startMs = Date.now();

  // ─── PATH 1: Sovereign3DAdapter ─────────────────────────────────────────────
  // Attempt when:
  //   (a) HOLOSCRIPT_SOVEREIGN_BASE_URL is explicitly set to a non-default URL, OR
  //   (b) HOLOSCRIPT_SOVEREIGN_MOCK=true is set (mock mode works without a live backend)
  // The default fallback URL ('https://api.holoscript.net/sovereign') is NOT
  // treated as "available" — it is the deploy target, not a live service.
  //
  // If the sovereign backend is configured but unreachable (fetch failed / network
  // error / timeout) and mock mode is OFF, the error is caught and we fall through
  // to PATH 2 rather than surfacing a hard failure to the caller. This covers the
  // case where HOLOSCRIPT_SOVEREIGN_BASE_URL is set in the environment but the
  // service is not yet deployed (e.g. wss://api.hololand.io offline).
  const sovereignBaseUrl = process.env.HOLOSCRIPT_SOVEREIGN_BASE_URL?.trim();
  const sovereignMock = Boolean(process.env.HOLOSCRIPT_SOVEREIGN_MOCK);
  const sovereignBackendLive =
    sovereignMock ||
    (sovereignBaseUrl &&
      sovereignBaseUrl !== '' &&
      sovereignBaseUrl !== 'https://api.holoscript.net/sovereign');

  if (sovereignBackendLive) {
    const { Sovereign3DAdapter } = await import('@holoscript/core/world');
    const adapter = new Sovereign3DAdapter({
      mockMode: sovereignMock,
    });

    try {
      const result = await adapter.generate({
        prompt,
        format: options.format ?? '3dgs',
        quality: options.quality ?? 'high',
        ...(options.input_image ? { input_image: options.input_image } : {}),
        ...(options.input_images?.length ? { input_images: options.input_images } : {}),
        ...(options.navEnabled !== undefined ? { navEnabled: options.navEnabled } : {}),
        ...(options.interactiveMode !== undefined
          ? { interactiveMode: options.interactiveMode }
          : {}),
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
      });

      // Build a companion .holo composition referencing the generated 3D asset
      const navLine = result.navmeshUrl ? `\n  navmesh { url: "${result.navmeshUrl}" }` : '';
      const interactiveLine = options.interactiveMode
        ? `\n  physics { enabled: true, collisions: true }`
        : '';

      const holoCode = `composition "GeneratedWorld" {
  environment {
    world_asset: "${result.assetUrl}"
    format: "${result.metadata.format}"
    bounds: [${result.metadata.bounds.join(', ')}]
    prompt: "${safePrompt}"
  }${navLine}${interactiveLine}
  object "Camera" {
    position: [0, 1.7, 0]
    @tracked
  }
}`;

      return {
        assetUrl: result.assetUrl,
        generationId: result.generationId,
        format: result.metadata.format,
        ...(result.navmeshUrl ? { navmeshUrl: result.navmeshUrl } : {}),
        ...(result.pointCloudUrl ? { pointCloudUrl: result.pointCloudUrl } : {}),
        holoCode,
        source: 'sovereign-3d',
        metrics: {
          ...(result.metadata.splatCount !== undefined
            ? { splatCount: result.metadata.splatCount }
            : {}),
          ...(result.metadata.triangleCount !== undefined
            ? { triangleCount: result.metadata.triangleCount }
            : {}),
          ...(result.metadata.generationMs !== undefined
            ? { generationMs: result.metadata.generationMs }
            : {}),
          bounds: result.metadata.bounds,
          ...(result.metadata.agentStart ? { agentStart: result.metadata.agentStart } : {}),
          ...(result.metadata.waypoints ? { waypoints: result.metadata.waypoints } : {}),
        },
      };
    } catch (err) {
      // Sovereign backend unreachable (network error / offline / fetch failed).
      // Fall through to PATH 2 (LLM) so generate_world succeeds even when the
      // 3D service is not yet deployed. Mock mode failures are re-thrown (they
      // indicate a code bug, not a network outage).
      if (sovereignMock) throw err;
      // Log once so operators can see the fallback reason without it being fatal.
      console.warn(
        `[generateWorldNative] Sovereign3DAdapter unreachable (${(err as Error).message ?? err}); ` +
          'falling back to text-LLM path. Set HOLOSCRIPT_SOVEREIGN_MOCK=true to use deterministic mock output instead.'
      );
    }
  }

  // ─── PATH 2: Brittney text-LLM (same proven path as generate_scene) ─────────
  // Returns a rich .holo world composition — real runnable HoloScript output.
  // No 3D splat asset; source='text-llm' declares this honestly.
  const worldPrompt = `Create a complete HoloScript world composition for: ${prompt}.
Include an environment block with skybox, lighting, and terrain. Add 3-6 named objects
that populate the world. Use traits like @physics, @collidable, @anchor, @world_locked
where appropriate. Return only valid HoloScript code with a composition root.`;

  const aiResult = await tryGenerateWithAI(worldPrompt, 'holo');
  const rawAiCode = aiResult ? normalizeSceneAIOutput(aiResult.code) : '';

  if (aiResult && isUsableSceneCode(rawAiCode)) {
    return {
      holoCode: rawAiCode,
      format: 'holo',
      source: 'text-llm',
      metrics: { generationMs: Date.now() - startMs },
    };
  }

  // ─── PATH 3: Heuristic fallback — deterministic, always succeeds ─────────────
  const interactiveLine = options.interactiveMode
    ? `\n  physics { enabled: true, collisions: true }`
    : '';

  const heuristicCode = `composition "GeneratedWorld" {
  // Generated from: ${safePrompt}
  environment {
    skybox: "gradient"
    ambient_light: 0.6
    fog: 0.02
  }${interactiveLine}

  object "Ground" {
    geometry: "plane"
    scale: [50, 1, 50]
    position: [0, 0, 0]
    @collidable
    @world_locked
  }

  object "Camera" {
    position: [0, 1.7, 0]
    @tracked
  }
}`;

  return {
    holoCode: heuristicCode,
    format: 'holo',
    source: 'heuristic',
    metrics: { generationMs: Date.now() - startMs },
  };
}

/**
 * Unified multimodal world generation pipeline.
 *
 * Accepts text, image, and video inputs as one request, routes text/images through
 * the existing native generator, attaches video reconstruction evidence when
 * supplied by the MCP handler, and returns a physics-bearing .holo scene graph
 * with semantic objects, inline colliders, and CAEL provenance.
 */
export async function generateWorldFromPrompt(
  prompt: string,
  options: WorldPromptGenerationOptions = {}
): Promise<WorldPromptGenerationResult> {
  const inputs = normalizeWorldPromptInputs(prompt, options.inputs);
  const modalities = [...new Set(inputs.map((input) => input.type))] as WorldPromptInputType[];
  const imageSources = inputs
    .filter((input) => input.type === 'image')
    .map((input) => input.data ?? input.url)
    .filter((source): source is string => typeof source === 'string' && source.trim().length > 0);
  const foundationPrompt = composeWorldFoundationPrompt(
    prompt,
    inputs,
    options.videoReconstruction
  );

  const nativeResult = await generateWorldNative(foundationPrompt, {
    format: options.format,
    quality: options.quality,
    input_image: options.input_image ?? imageSources[0],
    input_images: options.input_images ?? (imageSources.length > 1 ? imageSources : undefined),
    navEnabled: options.navEnabled ?? true,
    interactiveMode: options.interactiveMode ?? true,
    seed: options.seed,
  });

  const semanticNodes = deriveWorldSemanticNodes(prompt, options.videoReconstruction);
  const colliderMeshes = deriveWorldColliderMeshes(semanticNodes, options.videoReconstruction);
  const structuredAssetGraph = deriveStructuredAssetGraph({
    prompt,
    inputs,
    semanticNodes,
    colliderMeshes,
    videoReconstruction: options.videoReconstruction,
  });
  const provenance = buildWorldFoundationModelProvenance({
    prompt,
    inputs,
    nativeResult,
    semanticNodes,
    colliderMeshes,
    structuredAssetGraph,
    videoReconstruction: options.videoReconstruction,
    provider: options.provider,
    model: options.model,
    generatedAt: options.generatedAt,
  });

  const holoCode = attachWorldFoundationSceneGraph(nativeResult.holoCode, {
    provenance,
    semanticNodes,
    colliderMeshes,
    structuredAssetGraph,
  });

  return {
    ...nativeResult,
    holoCode,
    inputModalities: modalities,
    semanticNodes,
    colliderMeshes,
    structuredAssetGraph,
    provenance,
    ...(options.videoReconstruction ? { videoReconstruction: options.videoReconstruction } : {}),
  };
}

function normalizeWorldPromptInputs(
  prompt: string,
  inputs: readonly WorldPromptInput[] | undefined
): WorldPromptInput[] {
  const normalized: WorldPromptInput[] = [];
  if (prompt.trim()) {
    normalized.push({ type: 'text', text: prompt.trim(), label: 'prompt' });
  }
  for (const input of inputs ?? []) {
    if (!input || !['text', 'image', 'video'].includes(input.type)) continue;
    if (input.type === 'text' && !input.text?.trim()) continue;
    if (input.type !== 'text' && !input.url?.trim() && !input.data?.trim()) continue;
    normalized.push({
      ...input,
      text: input.text?.trim(),
      url: input.url?.trim(),
      data: input.data?.trim(),
      label: input.label?.trim(),
    });
  }
  return normalized;
}

function composeWorldFoundationPrompt(
  prompt: string,
  inputs: readonly WorldPromptInput[],
  reconstruction?: VideoReconstructionSummary
): string {
  const modalityList = [...new Set(inputs.map((input) => input.type))].join(', ') || 'text';
  const videoLine = reconstruction
    ? ` Video reconstruction session ${reconstruction.sessionId} replay ${reconstruction.replayFingerprint ?? 'unavailable'} is available as geometric evidence.`
    : '';
  return [
    prompt || 'Generate a navigable HoloScript world.',
    `Inputs: ${modalityList}.`,
    'Emit a semantic scene graph with material traits, physics traits, and collider geometry suitable for compile_to_sdf and compile_to_urdf.',
    videoLine,
  ]
    .filter(Boolean)
    .join(' ');
}

function deriveWorldSemanticNodes(
  prompt: string,
  reconstruction?: VideoReconstructionSummary
): WorldSemanticNode[] {
  const landmarkName = deriveLandmarkName(prompt);
  const nodes: WorldSemanticNode[] = [
    {
      id: 'terrain_surface',
      name: 'TerrainSurface',
      kind: 'terrain',
      geometry: 'plane',
      position: [0, 0, 0],
      scale: [48, 1, 48],
      material: 'generated_walkable_surface',
    },
    {
      id: 'primary_landmark',
      name: landmarkName,
      kind: 'landmark',
      geometry: 'box',
      position: [0, 1.5, -6],
      scale: [4, 3, 4],
      material: 'semantic_world_landmark',
    },
    {
      id: 'agent_start',
      name: 'AgentStart',
      kind: 'agent_start',
      geometry: 'capsule',
      position: [0, 1.7, 4],
      scale: [0.4, 1.7, 0.4],
      material: 'spawn_anchor',
    },
  ];

  if (reconstruction) {
    nodes.push({
      id: 'video_reconstruction_bounds',
      name: 'VideoReconstructionBounds',
      kind: 'video_reconstruction',
      geometry: 'mesh',
      position: [0, 1, 0],
      scale: [10, 2, 10],
      material: 'holomap_video_geometry',
    });
  }

  return nodes;
}

function deriveWorldColliderMeshes(
  nodes: readonly WorldSemanticNode[],
  reconstruction?: VideoReconstructionSummary
): WorldColliderMesh[] {
  const colliders: WorldColliderMesh[] = nodes
    .filter((node) => node.kind !== 'agent_start')
    .map((node) => ({
      id: `${node.id}_collider`,
      nodeId: node.id,
      shape: node.geometry === 'mesh' ? ('mesh' as const) : ('box' as const),
      position: node.position,
      size: node.scale,
      source:
        node.kind === 'video_reconstruction'
          ? ('video_reconstruction' as const)
          : ('semantic_node' as const),
    }));

  if (reconstruction) {
    colliders.push({
      id: 'holomap_navmesh_collider',
      nodeId: 'video_reconstruction_bounds',
      shape: 'mesh',
      position: [0, 0.05, 0],
      size: [10, 0.1, 10],
      source: 'navmesh',
    });
  }

  return colliders;
}

function deriveStructuredAssetGraph(input: {
  prompt: string;
  inputs: readonly WorldPromptInput[];
  semanticNodes: readonly WorldSemanticNode[];
  colliderMeshes: readonly WorldColliderMesh[];
  videoReconstruction?: VideoReconstructionSummary;
}): WorldStructuredAssetGraph {
  const inputModalities = [
    ...new Set(input.inputs.map((worldInput) => worldInput.type)),
  ] as WorldPromptInputType[];
  const inputLabels = input.inputs.map(describeWorldPromptInput);
  const graphId = `sag_${stableHash(
    JSON.stringify({
      prompt: input.prompt,
      inputs: inputLabels,
      replay: input.videoReconstruction?.replayFingerprint,
    })
  )}`;

  const nodes: WorldAssetGraphNode[] = input.semanticNodes.map((node) => ({
    id: node.id,
    name: node.name,
    kind: mapSemanticNodeToAssetKind(node.kind),
    geometry: node.geometry,
    position: node.position,
    scale: node.scale,
    material: node.material,
    provenance:
      node.kind === 'terrain'
        ? 'generated'
        : node.kind === 'agent_start'
          ? 'generated'
          : node.kind === 'video_reconstruction'
            ? 'observed'
            : 'inferred',
    confidence:
      node.kind === 'video_reconstruction' ? 0.92 : node.kind === 'agent_start' ? 1 : 0.82,
    sourceInputLabels: inputLabels,
    sourceNodeIds: [node.id],
    traits: traitsForSemanticNode(node),
    ...(node.kind === 'terrain' ? { navigationRole: 'walkable' as const } : {}),
    ...(node.kind === 'agent_start' ? { navigationRole: 'spawn' as const } : {}),
    ...(node.kind === 'landmark' ? { navigationRole: 'target' as const } : {}),
    ...(node.kind === 'video_reconstruction' ? { colliderRole: 'static' as const } : {}),
    ...(node.kind !== 'agent_start' && node.kind !== 'video_reconstruction'
      ? { colliderRole: 'static' as const }
      : {}),
  }));

  const imageInputs = input.inputs.filter((worldInput) => worldInput.type === 'image');
  imageInputs.forEach((worldInput, index) => {
    nodes.push({
      id: `image_observation_${index + 1}`,
      name: `ImageObservation${index + 1}`,
      kind: 'semantic_observation',
      geometry: 'plane',
      position: [-6 + index * 2.5, 2.2, -3.5],
      scale: [2.2, 1.25, 0.04],
      material: 'source_image_semantic_observation',
      provenance: 'observed',
      confidence: 0.88,
      sourceInputLabels: [describeWorldPromptInput(worldInput, index)],
      sourceNodeIds: [],
      traits: ['@semantic_input', '@image_observation', '@structured_asset_seed'],
    });
  });

  const hasOcclusionEvidence = imageInputs.length > 0 || Boolean(input.videoReconstruction);
  if (hasOcclusionEvidence) {
    nodes.push({
      id: 'occluded_volume_completion',
      name: 'OccludedVolumeCompletion',
      kind: 'occluder_completion',
      geometry: 'box',
      position: [0, 1.35, -8.5],
      scale: [5.5, 2.7, 1.5],
      material: 'completed_backside_geometry',
      provenance: 'completed',
      confidence: input.videoReconstruction ? 0.72 : 0.64,
      sourceInputLabels: inputLabels,
      sourceNodeIds: input.semanticNodes.map((node) => node.id),
      traits: ['@occlusion_completed', '@collidable', '@world_locked'],
      colliderRole: 'static',
    });
  }

  const terrain = input.semanticNodes.find((node) => node.kind === 'terrain');
  const landmark = input.semanticNodes.find((node) => node.kind === 'landmark');
  const agentStart = input.semanticNodes.find((node) => node.kind === 'agent_start');
  const edges: WorldAssetGraphEdge[] = [];
  const addEdge = (
    from: string | undefined,
    to: string | undefined,
    relationship: WorldAssetGraphEdge['relationship'],
    confidence: number
  ): void => {
    if (!from || !to) return;
    edges.push({
      id: `edge_${edges.length + 1}_${relationship}`,
      from,
      to,
      relationship,
      confidence,
    });
  };

  addEdge(terrain?.id, landmark?.id, 'supports', 0.86);
  addEdge(terrain?.id, agentStart?.id, 'supports', 0.94);
  addEdge(agentStart?.id, landmark?.id, 'leads_to', 0.81);

  for (const observation of nodes.filter((node) => node.kind === 'semantic_observation')) {
    addEdge(observation.id, landmark?.id, 'observes', 0.78);
    addEdge(observation.id, 'occluded_volume_completion', 'anchors', 0.66);
  }

  if (nodes.some((node) => node.id === 'occluded_volume_completion')) {
    addEdge(landmark?.id, 'occluded_volume_completion', 'occludes', 0.62);
    addEdge('occluded_volume_completion', landmark?.id, 'completes', 0.7);
  }

  if (input.videoReconstruction) {
    addEdge('video_reconstruction_bounds', landmark?.id, 'anchors', 0.84);
    addEdge('video_reconstruction_bounds', 'occluded_volume_completion', 'anchors', 0.74);
  }

  const navigationPath: [number, number, number][] = [
    agentStart?.position ?? [0, 1.7, 4],
    [0, 1.2, 0],
    landmark?.position ?? [0, 1.5, -6],
  ];

  const unsigned = {
    schema: 'holoscript.structured_asset_graph.v1' as const,
    graphId,
    sourcePromptHash: stableHash(input.prompt),
    inputModalities,
    nodes,
    edges,
    navigationPath,
    colliderMeshIds: input.colliderMeshes.map((collider) => collider.id),
    occlusionCompletions: nodes
      .filter((node) => node.provenance === 'completed')
      .map((node) => node.id),
    materialAtlas: buildWorldAssetMaterialAtlas(nodes),
    textureMapRefs: buildTextureMapRefs(input.inputs),
    matrixRefs: nodes.map(
      (node) => `${node.id}:position=${formatVec(node.position)};scale=${formatVec(node.scale)}`
    ),
    benchmarkBoundary: 'marble_gap_sovereign_structured_asset_graph' as const,
  };

  return {
    ...unsigned,
    graphHash: stableHash(JSON.stringify(unsigned)),
  };
}

function buildWorldFoundationModelProvenance(input: {
  prompt: string;
  inputs: readonly WorldPromptInput[];
  nativeResult: NativeWorldGenerationResult;
  semanticNodes: readonly WorldSemanticNode[];
  colliderMeshes: readonly WorldColliderMesh[];
  structuredAssetGraph?: WorldStructuredAssetGraph;
  videoReconstruction?: VideoReconstructionSummary;
  provider?: string;
  model?: string;
  generatedAt?: string;
}): WorldFoundationModelProvenance {
  const inputModalities = [
    ...new Set(input.inputs.map((worldInput) => worldInput.type)),
  ] as WorldPromptInputType[];
  const sourceAssetUrls = input.inputs
    .map((worldInput) => worldInput.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
  if (input.nativeResult.assetUrl) sourceAssetUrls.push(input.nativeResult.assetUrl);
  if (input.nativeResult.navmeshUrl) sourceAssetUrls.push(input.nativeResult.navmeshUrl);

  const generatedAt = input.generatedAt ?? new Date(0).toISOString();
  const synthesisId =
    input.nativeResult.generationId ??
    `wfm_${stableHash(
      JSON.stringify({
        prompt: input.prompt,
        modalities: inputModalities,
        replay: input.videoReconstruction?.replayFingerprint,
      })
    )}`;

  const unsigned = {
    schema: 'cael.world_foundation_model.v1' as const,
    synthesisId,
    provider: input.provider ?? input.nativeResult.source,
    model: input.model ?? defaultWorldFoundationModel(input.nativeResult.source),
    generatedAt,
    promptHash: stableHash(input.prompt),
    inputModalities,
    semanticNodeCount: input.semanticNodes.length,
    colliderCount: input.colliderMeshes.length,
    videoReconstructionSessionId: input.videoReconstruction?.sessionId,
    replayFingerprint: input.videoReconstruction?.replayFingerprint,
    sourceAssetUrls,
    structuredAssetGraphHash: input.structuredAssetGraph?.graphHash,
    structuredAssetGraphNodeCount: input.structuredAssetGraph?.nodes.length,
    occlusionCompletionCount: input.structuredAssetGraph?.occlusionCompletions.length,
  };

  return {
    ...unsigned,
    receiptHash: stableHash(JSON.stringify(unsigned)),
  };
}

function attachWorldFoundationSceneGraph(
  holoCode: string,
  input: {
    provenance: WorldFoundationModelProvenance;
    semanticNodes: readonly WorldSemanticNode[];
    colliderMeshes: readonly WorldColliderMesh[];
    structuredAssetGraph?: WorldStructuredAssetGraph;
  }
): string {
  const blocks = [
    renderWorldFoundationProvenanceObject(input.provenance),
    ...(input.structuredAssetGraph
      ? [renderStructuredAssetGraphObject(input.structuredAssetGraph)]
      : []),
    ...input.semanticNodes.map(renderSemanticNodeObject),
    ...input.colliderMeshes.map(renderColliderObject),
    ...(input.structuredAssetGraph
      ? input.structuredAssetGraph.nodes.map((node) =>
          renderAssetGraphNodeObject(node, input.structuredAssetGraph?.graphId ?? '')
        )
      : []),
  ];
  const trimmed = holoCode.trim();
  const rootClose = trimmed.lastIndexOf('}');
  if (rootClose < 0) {
    return `composition "GeneratedWorld" {\n${blocks.join('\n\n')}\n}`;
  }
  return `${trimmed.slice(0, rootClose).trimEnd()}\n\n${blocks.join('\n\n')}\n${trimmed.slice(rootClose)}`;
}

function renderWorldFoundationProvenanceObject(provenance: WorldFoundationModelProvenance): string {
  const lines = [
    '  object "WorldFoundationProvenance" {',
    '    @world_foundation_model {',
    `      schema: "${provenance.schema}"`,
    `      synthesis_id: "${escapeHoloString(provenance.synthesisId)}"`,
    `      provider: "${escapeHoloString(provenance.provider)}"`,
    `      model: "${escapeHoloString(provenance.model)}"`,
    `      generated_at: "${escapeHoloString(provenance.generatedAt)}"`,
    `      prompt_hash: "${provenance.promptHash}"`,
    `      input_modalities: ${renderStringList(provenance.inputModalities)}`,
    `      semantic_node_count: ${provenance.semanticNodeCount}`,
    `      collider_count: ${provenance.colliderCount}`,
    `      source_asset_urls: ${renderStringList(provenance.sourceAssetUrls)}`,
  ];
  if (provenance.structuredAssetGraphHash) {
    lines.push(
      `      structured_asset_graph_hash: "${provenance.structuredAssetGraphHash}"`,
      `      structured_asset_graph_node_count: ${provenance.structuredAssetGraphNodeCount ?? 0}`,
      `      occlusion_completion_count: ${provenance.occlusionCompletionCount ?? 0}`
    );
  }
  lines.push(`      receipt_hash: "${provenance.receiptHash}"`);
  if (provenance.videoReconstructionSessionId) {
    lines.push(
      `      video_reconstruction_session_id: "${escapeHoloString(provenance.videoReconstructionSessionId)}"`
    );
  }
  if (provenance.replayFingerprint) {
    lines.push(`      replay_fingerprint: "${escapeHoloString(provenance.replayFingerprint)}"`);
  }
  lines.push('    }');
  lines.push('  }');
  return lines.join('\n');
}

function renderStructuredAssetGraphObject(graph: WorldStructuredAssetGraph): string {
  const materialAtlas = Object.entries(graph.materialAtlas).map(
    ([material, ref]) => `${material}:${ref}`
  );
  return `  object "StructuredAssetGraph" {
    @structured_asset_graph {
      schema: "${graph.schema}"
      graph_id: "${graph.graphId}"
      graph_hash: "${graph.graphHash}"
      source_prompt_hash: "${graph.sourcePromptHash}"
      benchmark_boundary: "${graph.benchmarkBoundary}"
      input_modalities: ${renderStringList(graph.inputModalities)}
      node_count: ${graph.nodes.length}
      edge_count: ${graph.edges.length}
      collider_mesh_ids: ${renderStringList(graph.colliderMeshIds)}
      occlusion_completions: ${renderStringList(graph.occlusionCompletions)}
      navigation_path: ${renderStringList(graph.navigationPath.map(formatVec))}
      material_atlas: ${renderStringList(materialAtlas)}
      texture_map_refs: ${renderStringList(graph.textureMapRefs)}
      matrix_refs: ${renderStringList(graph.matrixRefs)}
    }
  }`;
}

function renderAssetGraphNodeObject(node: WorldAssetGraphNode, graphId: string): string {
  return `  object "${toPascalCase(`asset_graph_${node.id}`)}" {
    geometry: "${node.geometry}"
    position: ${formatVec(node.position)}
    scale: ${formatVec(node.scale)}
    @structured_asset_node {
      graph_id: "${graphId}"
      node_id: "${node.id}"
      kind: "${node.kind}"
      provenance: "${node.provenance}"
      confidence: ${Number(node.confidence.toFixed(3))}
      material: "${node.material}"
      source_inputs: ${renderStringList(node.sourceInputLabels)}
      source_nodes: ${renderStringList(node.sourceNodeIds)}
      traits: ${renderStringList(node.traits)}
      navigation_role: "${node.navigationRole ?? 'none'}"
      collider_role: "${node.colliderRole ?? 'none'}"
    }
    @material { preset: "${node.material}" }
  }`;
}

function renderSemanticNodeObject(node: WorldSemanticNode): string {
  return `  object "${node.name}" {
    geometry: "${node.geometry}"
    position: ${formatVec(node.position)}
    scale: ${formatVec(node.scale)}
    @semantic_node {
      node_id: "${node.id}"
      kind: "${node.kind}"
      material: "${node.material}"
    }
    @material { preset: "${node.material}" }
    @physics { mass: ${node.kind === 'terrain' ? 0 : 1} }
    @collidable
  }`;
}

function renderColliderObject(collider: WorldColliderMesh): string {
  return `  object "${toPascalCase(collider.id)}" {
    geometry: "box"
    position: ${formatVec(collider.position)}
    scale: ${formatVec(collider.size)}
    @collider {
      shape: "${collider.shape}"
      source_node: "${collider.nodeId}"
      source: "${collider.source}"
      size: ${formatVec(collider.size)}
    }
    @physics { mass: 0 }
    @collidable
  }`;
}

function defaultWorldFoundationModel(source: NativeWorldGenerationResult['source']): string {
  if (source === 'sovereign-3d') return 'sovereign-3d-world-foundation';
  if (source === 'text-llm') return 'text-to-world-semantic-synthesis';
  return 'heuristic-world-foundation-fallback';
}

function describeWorldPromptInput(input: WorldPromptInput, index = 0): string {
  if (input.label?.trim()) return input.label.trim();
  if (input.url?.trim()) return input.url.trim();
  if (input.type === 'text' && input.text?.trim()) return 'prompt';
  if (input.data?.trim()) return `${input.type}_embedded_${stableHash(input.data.trim())}`;
  return `${input.type}_${index + 1}`;
}

function mapSemanticNodeToAssetKind(kind: WorldSemanticNode['kind']): WorldAssetGraphNodeKind {
  if (kind === 'video_reconstruction') return 'video_reconstruction';
  if (kind === 'agent_start') return 'agent_start';
  if (kind === 'terrain') return 'terrain';
  return 'landmark';
}

function traitsForSemanticNode(node: WorldSemanticNode): string[] {
  if (node.kind === 'terrain') return ['@walkable', '@collidable', '@world_locked'];
  if (node.kind === 'agent_start') return ['@spawn_anchor', '@tracked'];
  if (node.kind === 'video_reconstruction') return ['@holomap_evidence', '@collidable'];
  return ['@semantic_landmark', '@collidable', '@anchor'];
}

function buildWorldAssetMaterialAtlas(
  nodes: readonly Pick<WorldAssetGraphNode, 'material'>[]
): Record<string, string> {
  const atlas: Record<string, string> = {};
  for (const material of [...new Set(nodes.map((node) => node.material))].sort()) {
    atlas[material] = `materials/generated/${material}.mat`;
  }
  return atlas;
}

function buildTextureMapRefs(inputs: readonly WorldPromptInput[]): string[] {
  return inputs
    .filter((input) => input.type === 'image')
    .map((input, index) => {
      if (input.url?.trim()) return input.url.trim();
      if (input.data?.trim()) return `embedded_image_${index + 1}:${stableHash(input.data.trim())}`;
      return input.label?.trim() ?? `image_${index + 1}`;
    });
}

function deriveLandmarkName(prompt: string): string {
  const words = prompt
    .split(/[^a-zA-Z0-9]+/)
    .filter((word) => word.length > 2 && !/^(the|and|with|from|into|for|that|this)$/i.test(word));
  return `${toPascalCase(words.slice(0, 3).join('_') || 'Primary')}Landmark`;
}

function toPascalCase(value: string): string {
  const out = value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
  return out || 'GeneratedObject';
}

function formatVec(v: readonly number[]): string {
  return `[${v.map((n) => Number(n.toFixed(6))).join(', ')}]`;
}

function renderStringList(values: readonly string[]): string {
  return `[${values.map((value) => `"${escapeHoloString(value)}"`).join(', ')}]`;
}

function escapeHoloString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

/**
 * Suggest traits based on object description
 */
export function suggestTraits(
  description: string,
  context?: string
): {
  traits: string[];
  reasoning: Record<string, string>;
  confidence: number;
} {
  const lowerDesc = (description + ' ' + (context || '')).toLowerCase();
  const suggestedTraits = new Set<string>();
  const reasoning: Record<string, string> = {};

  for (const [keyword, traits] of Object.entries(TRAIT_KEYWORDS)) {
    if (lowerDesc.includes(keyword)) {
      for (const trait of traits) {
        if (!suggestedTraits.has(trait)) {
          suggestedTraits.add(trait);
          reasoning[trait] = `Suggested because description mentions "${keyword}"`;
        }
      }
    }
  }

  // Default traits for interactive objects
  if (suggestedTraits.size === 0) {
    suggestedTraits.add('@pointable');
    reasoning['@pointable'] = 'Default trait for interactive objects';
  }

  // Always suggest @collidable if physics-related
  if (suggestedTraits.has('@physics') && !suggestedTraits.has('@collidable')) {
    suggestedTraits.add('@collidable');
    reasoning['@collidable'] = 'Required for physics interactions';
  }

  const traits = Array.from(suggestedTraits);
  const confidence = Math.min(0.95, 0.5 + traits.length * 0.1);

  return { traits, reasoning, confidence };
}

/**
 * Suggest universal v6 traits based on service/infrastructure description.
 * Covers 8 domains: service, contract, data, network, pipeline, metric, container, resilience.
 */
export function suggestUniversalTraits(
  description: string,
  domain?: string,
  context?: string
): {
  traits: string[];
  domains: Record<string, string[]>;
  reasoning: Record<string, string>;
  confidence: number;
} {
  const lowerDesc = (description + ' ' + (context || '')).toLowerCase();
  const suggestedTraits = new Set<string>();
  const reasoning: Record<string, string> = {};
  const domainTraits: Record<string, Set<string>> = {};

  for (const [keyword, entry] of Object.entries(UNIVERSAL_TRAIT_KEYWORDS)) {
    // If domain filter is set, skip non-matching domains
    if (domain && entry.domain !== domain) continue;

    if (lowerDesc.includes(keyword)) {
      if (!domainTraits[entry.domain]) domainTraits[entry.domain] = new Set();

      for (const trait of entry.traits) {
        if (!suggestedTraits.has(trait)) {
          suggestedTraits.add(trait);
          domainTraits[entry.domain].add(trait);
          reasoning[trait] = `Matched keyword "${keyword}" in ${entry.domain} domain`;
        }
      }
    }
  }

  // Cross-domain inference: if service traits are present, suggest health_check
  if (domainTraits['service']?.size && !suggestedTraits.has('@health_check')) {
    suggestedTraits.add('@health_check');
    if (!domainTraits['metric']) domainTraits['metric'] = new Set();
    domainTraits['metric'].add('@health_check');
    reasoning['@health_check'] = 'Auto-suggested: services should expose health checks';
  }

  // If pipeline traits but no resilience, suggest retry + circuit_breaker
  if (domainTraits['pipeline']?.size && !domainTraits['resilience']?.size) {
    for (const trait of ['@retry', '@circuit_breaker']) {
      suggestedTraits.add(trait);
      if (!domainTraits['resilience']) domainTraits['resilience'] = new Set();
      domainTraits['resilience'].add(trait);
      reasoning[trait] = 'Auto-suggested: pipelines benefit from resilience patterns';
    }
  }

  // If data traits but no metric, suggest structured_log
  if (domainTraits['data']?.size && !domainTraits['metric']?.size) {
    suggestedTraits.add('@structured_log');
    if (!domainTraits['metric']) domainTraits['metric'] = new Set();
    domainTraits['metric'].add('@structured_log');
    reasoning['@structured_log'] =
      'Auto-suggested: data operations benefit from structured logging';
  }

  // Default if nothing matched
  if (suggestedTraits.size === 0) {
    suggestedTraits.add('@service');
    suggestedTraits.add('@endpoint');
    reasoning['@service'] = 'Default trait for service descriptions';
    reasoning['@endpoint'] = 'Default trait for service descriptions';
    domainTraits['service'] = new Set(['@service', '@endpoint']);
  }

  const traits = Array.from(suggestedTraits);
  const domains: Record<string, string[]> = {};
  for (const [d, set] of Object.entries(domainTraits)) {
    domains[d] = Array.from(set);
  }

  const confidence = Math.min(0.95, 0.4 + traits.length * 0.05 + Object.keys(domains).length * 0.1);

  return { traits, domains, reasoning, confidence };
}

/**
 * Generate an object from natural language description
 */
export function generateObject(
  description: string,
  options: GenerateOptions = {}
): {
  code: string;
  traits: string[];
  geometry: string;
  format: string;
} {
  const format = options.format || 'hsplus';
  const lowerDesc = description.toLowerCase();

  // Extract geometry
  let geometry = 'sphere'; // default
  for (const [keyword, geo] of Object.entries(GEOMETRY_KEYWORDS)) {
    if (lowerDesc.includes(keyword)) {
      geometry = geo;
      break;
    }
  }

  // Extract color
  let color = '#00ffff'; // default cyan
  for (const [keyword, hex] of Object.entries(COLOR_KEYWORDS)) {
    if (lowerDesc.includes(keyword)) {
      color = hex;
      break;
    }
  }

  // Extract material preset (additive — does not replace the primitive-geometry
  // fallback above, which is still correct for genuine placeholder/test requests).
  // When a material-flavored keyword is present, richen the generated object with a
  // named @material_preset trait instead of leaving it flat-color-only.
  let materialPreset: string | undefined;
  for (const [keyword, preset] of Object.entries(MATERIAL_PRESET_KEYWORDS)) {
    if (lowerDesc.includes(keyword)) {
      materialPreset = preset;
      break;
    }
  }

  // Get traits
  const { traits } = suggestTraits(description);
  if (materialPreset) {
    traits.push(`@material_preset("${materialPreset}")`);
  }

  // Extract name
  const words = description.split(/\s+/);
  const nameWord = words.find((w) => /^[A-Z]/.test(w)) || words[words.length - 1] || 'Object';
  const objectName = nameWord.replace(/[^a-zA-Z0-9]/g, '');

  // Generate code based on format
  let code: string;

  if (format === 'holo') {
    code = generateHoloObject(objectName, geometry, color, traits, options.includeDocs);
  } else if (format === 'hsplus') {
    code = generateHsplusObject(objectName, geometry, color, traits, options.includeDocs);
  } else {
    code = generateHsObject(objectName, geometry, color, traits, options.includeDocs);
  }

  return { code, traits, geometry, format };
}

function generateHoloObject(
  name: string,
  geometry: string,
  color: string,
  traits: string[],
  docs?: boolean
): string {
  const traitsStr = traits.map((t) => `    ${t}`).join('\n');
  const docComment = docs ? `  // ${name} - Generated from natural language description\n` : '';

  return `${docComment}  template "${name}Template" {
${traitsStr}
    geometry: "${geometry}"
    color: "${color}"
  }

  object "${name}" using "${name}Template" {
    position: [0, 1, 0]
  }`;
}

function generateHsplusObject(
  name: string,
  geometry: string,
  color: string,
  traits: string[],
  docs?: boolean
): string {
  const traitsStr = traits.map((t) => `  ${t}`).join('\n');
  const docComment = docs ? `// ${name} - Generated from natural language description\n` : '';

  return `${docComment}composition "${name}Scene" {
  template "${name}Template" {
${traitsStr}
    geometry: "${geometry}"
    color: "${color}"
  }

  object "${name}" using "${name}Template" {
    position: [0, 1, 0]
  }
}`;
}

function generateHsObject(
  name: string,
  geometry: string,
  color: string,
  traits: string[],
  docs?: boolean
): string {
  const traitsStr = traits.map((t) => `  ${t}`).join('\n');
  const docComment = docs ? `// ${name} - Generated from natural language description\n` : '';

  return `${docComment}composition "${name}Scene" {
  template "${name}Template" {
${traitsStr}
    geometry: "${geometry}"
    color: "${color}"
  }

  object "${name}" using "${name}Template" {
    position: [0, 1, 0]
  }
}`;
}

/**
 * Generate a complete scene from natural language description
 */
export function generateScene(
  description: string,
  options: SceneOptions = {}
): {
  code: string;
  stats: {
    objects: number;
    traits: number;
    lines: number;
  };
} {
  const style = options.style || 'detailed';
  const features = options.features || [];
  const _lowerDesc = description.toLowerCase();

  // Parse scene elements from description
  const elements = parseSceneElements(description);

  // Generate objects
  const objects = elements.objects.map((obj) => {
    const { code } = generateObject(obj.description, {
      format: 'holo',
      includeDocs: style !== 'minimal',
    });
    return code;
  });

  // Generate environment
  const environment = generateEnvironment(description, style);

  // Generate logic if needed
  const logic = features.includes('logic') ? generateLogic(elements) : '';

  // Combine into composition
  const code = `composition "${elements.name}" {
  ${environment}

${objects.map((o) => '  ' + o.replace(/\n/g, '\n  ')).join('\n\n')}
${logic ? '\n  ' + logic : ''}}`;

  return {
    code,
    stats: {
      objects: objects.length,
      traits: (code.match(/@\w+/g) || []).length,
      lines: code.split('\n').length,
    },
  };
}

interface SceneElement {
  name: string;
  objects: { name: string; description: string }[];
  environment: string[];
}

function parseSceneElements(description: string): SceneElement {
  const _words = description.split(/\s+/);

  // Extract scene name
  const nameMatch = description.match(
    /(a|an|the)?\s*([a-z]+(?:\s+[a-z]+)?)\s*(scene|world|room|space)/i
  );
  const name = nameMatch ? capitalize(nameMatch[2]) : 'Generated Scene';

  // Extract objects (simplified parsing)
  const objectMatches = description.match(
    /(?:with|containing|featuring|has|include)\s+([^,]+(?:,\s*[^,]+)*)/i
  );
  const objects: { name: string; description: string }[] = [];

  if (objectMatches) {
    const items = objectMatches[1].split(/,\s*and\s*|,\s*|\s+and\s+/);
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed) {
        objects.push({
          name: extractObjectName(trimmed),
          description: trimmed,
        });
      }
    }
  }

  // Default object if none extracted
  if (objects.length === 0) {
    objects.push({
      name: 'MainObject',
      description: description,
    });
  }

  // Extract environment hints
  const environment: string[] = [];
  if (description.includes('forest') || description.includes('nature')) environment.push('nature');
  if (description.includes('space') || description.includes('galaxy')) environment.push('space');
  if (description.includes('night')) environment.push('night');
  if (description.includes('day') || description.includes('sunny')) environment.push('day');

  return { name, objects, environment };
}

function extractObjectName(description: string): string {
  const words = description.split(/\s+/);
  const lastWord = words[words.length - 1];
  return capitalize(lastWord.replace(/[^a-zA-Z0-9]/g, ''));
}

function generateEnvironment(description: string, style: string): string {
  const lowerDesc = description.toLowerCase();

  // Determine skybox
  let skybox = 'gradient';
  if (lowerDesc.includes('forest') || lowerDesc.includes('nature')) skybox = 'forest';
  if (lowerDesc.includes('space') || lowerDesc.includes('galaxy') || lowerDesc.includes('nebula'))
    skybox = 'nebula';
  if (lowerDesc.includes('sunset') || lowerDesc.includes('sunrise')) skybox = 'sunset';
  if (lowerDesc.includes('night') || lowerDesc.includes('moon')) skybox = 'night';
  if (lowerDesc.includes('ocean') || lowerDesc.includes('beach')) skybox = 'ocean';

  // Determine lighting
  let ambientLight = 0.3;
  if (lowerDesc.includes('dark') || lowerDesc.includes('night')) ambientLight = 0.1;
  if (lowerDesc.includes('bright') || lowerDesc.includes('sunny')) ambientLight = 0.7;

  if (style === 'minimal') {
    return `environment {
    skybox: "${skybox}"
  }`;
  }

  return `environment {
    skybox: "${skybox}"
    ambient_light: ${ambientLight}
    fog: { enabled: true, density: 0.01 }
  }`;
}

function generateLogic(elements: SceneElement): string {
  if (elements.objects.length < 2) return '';

  return `logic {
    // Auto-generated interaction logic
    on_scene_start() {
      console.debug("Scene loaded!")
    }
  }`;
}

/**
 * Suggest Semantic2D UI traits based on element description
 */
export function suggest2DTraits(
  description: string,
  context?: string
): {
  traits: string[];
  reasoning: Record<string, string>;
} {
  const suggestedTraits = new Set<string>();
  const reasoning: Record<string, string> = {};
  const lowerDesc = (description + ' ' + (context || '')).toLowerCase();

  const keywords: Record<string, string[]> = {
    button: ['@semantic_entity', '@particle_feedback'],
    click: ['@semantic_entity', '@particle_feedback'],
    layout: ['@semantic_layout'],
    flex: ['@semantic_layout'],
    grid: ['@semantic_layout'],
    color: ['@dynamic_visual'],
    theme: ['@dynamic_visual'],
    dashboard: ['@2d_canvas', '@semantic_layout'],
    screen: ['@2d_canvas'],
    agent: ['@agent_attention'],
    bounty: ['@agent_attention'],
    intent: ['@intent_driven'],
    action: ['@intent_driven'],
    metric: ['@live_metric'],
    data: ['@live_metric'],
    chart: ['@live_metric'],
    number: ['@live_metric'],
  };

  for (const [key, traits] of Object.entries(keywords)) {
    if (lowerDesc.includes(key)) {
      for (const t of traits) {
        suggestedTraits.add(t);
        reasoning[t] = `Suggested because description mentions "${key}"`;
      }
    }
  }

  if (suggestedTraits.size === 0) {
    suggestedTraits.add('@semantic_entity');
    reasoning['@semantic_entity'] = 'Default trait for 2D semantic elements';
  }

  return { traits: Array.from(suggestedTraits), reasoning };
}

/**
 * Generate a V6 Semantic2D composition from natural language
 */
export async function generateSemanticUIForMCP(
  description: string,
  _options: any = {}
): Promise<any> {
  // The generated surface is agent-authored: it must route through the Native2DCompiler
  // @verified_view gate — every data-bound element declares what it renders (@projects)
  // and the compiler proves that claim against the actual binding. So the prompt asks for
  // the provenance-complete shape, and whatever comes back is completed + verified below.
  const aiPrompt = `Create a V6 Semantic2D composition for: ${description}. Use @2d_canvas, @semantic_layout, @semantic_entity, and other Semantic2D traits. When the surface shows DATA: declare composition state, bind each data element with @bind { state, path }, and give every bound element a provenance receipt @projects { node: "<state>.<path>" } naming EXACTLY what it renders; add composition-level @verified_view. Return only code.`;
  const aiResult = await tryGenerateWithAI(aiPrompt, 'holo');
  const code = aiResult ? normalizeSceneAIOutput(aiResult.code) : '';

  if (aiResult && isUsableSceneCode(code)) {
    // Complete any receipts the model omitted, then keep the surface ONLY if it is
    // provably honest under the gate. An AI surface that can't be made provenance-complete
    // falls back to the heuristic floor rather than shipping an unverifiable claim.
    const enforced = enforceVerifiedViewReceipts(code);
    if (isProvenanceComplete(enforced)) {
      return {
        code: enforced,
        format: 'holo',
        source: 'ai',
        provider: aiResult.provider,
        traits: aiResult.detectedTraits,
        verifiedView: true,
      };
    }
    // else: fall through to the provenance-complete heuristic below (honest floor)
  }

  return {
    code: buildVerifiedSemanticUiHeuristic(description),
    format: 'holo',
    source: 'heuristic',
    verifiedView: true,
  };
}

/**
 * Heuristic floor for generate_semantic_ui: a provenance-complete @verified_view surface
 * with data-bound stat readouts, each carrying its derived @projects receipt. Compiles
 * clean through the Native2DCompiler gate (pinned by the core round-trip test). The final
 * enforceVerifiedViewReceipts pass guarantees completeness even if this template is edited.
 */
function buildVerifiedSemanticUiHeuristic(description: string): string {
  const title =
    description
      .replace(/["\\\r\n]/g, ' ')
      .trim()
      .slice(0, 80) || 'Semantic surface';
  const raw = `composition "SemanticApp" {
  @2d_canvas { projection: "flat-semantic" }
  @verified_view
  state {
    metrics: { sessions: 0, errors: 0 }
  }
  object "Root" {
    @semantic_layout { flow: "column" }
    @layout { flex: "column", gap: "8px" }
    object "Title" {
      @text { variant: "h3", content: "${title}" }
    }
    object "SessionsLabel" {
      @text { variant: "caption", content: "Sessions" }
    }
    object "Sessions" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "sessions", fallback: "0" }
      @projects { node: "metrics.sessions" }
    }
    object "ErrorsLabel" {
      @text { variant: "caption", content: "Errors" }
    }
    object "Errors" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "errors", fallback: "0" }
      @projects { node: "metrics.errors" }
    }
  }
}`;
  return enforceVerifiedViewReceipts(raw);
}
