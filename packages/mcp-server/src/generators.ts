/**
 * HoloScript Code Generators
 *
 * AI-powered generation of HoloScript code from natural language.
 */

import { createProviderManager, type LLMProviderName } from '@holoscript/llm-provider';

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

const AI_PROVIDER_PRIORITY: readonly LLMProviderName[] = [
  'anthropic',
  'openai',
  'gemini',
  'local-llm', // any llama.cpp / Ollama / LM Studio server
  'bitnet', // dedicated bitnet.cpp server (HOLOSCRIPT_BITNET_URL required)
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

  const attemptedProviders: LLMProviderName[] = [];

  for (const providerName of getAIProviderOrder(manager.getRegisteredProviders())) {
    const provider = manager.getProvider(providerName);
    if (!provider) continue;

    attemptedProviders.push(providerName);

    try {
      // Local providers (small models) need conservative settings to stay coherent
      const isLocalProvider = providerName === 'bitnet' || providerName === 'local-llm';
      const result = await provider.generateHoloScript({
        prompt,
        targetFormat,
        maxObjects: targetFormat === 'holo' ? (isLocalProvider ? 4 : 8) : 1,
        temperature: isLocalProvider ? 0.1 : 0.35,
      });

      return {
        code: result.code,
        provider: result.provider,
        attemptedProviders: [...attemptedProviders],
        detectedTraits: result.detectedTraits,
      };
    } catch {
      // Fall through to next provider. The deterministic generator remains the final safety net.
    }
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

  return fallback;
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

  // Get traits
  const { traits } = suggestTraits(description);

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
      console.log("Scene loaded!")
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
  options: any = {}
): Promise<any> {
  const aiPrompt = `Create a V6 Semantic2D composition for: ${description}. Use @2d_canvas, @semantic_layout, @semantic_entity, and other Semantic2D traits. Return only code.`;
  const aiResult = await tryGenerateWithAI(aiPrompt, 'holo');
  const code = aiResult ? normalizeSceneAIOutput(aiResult.code) : '';

  if (aiResult && isUsableSceneCode(code)) {
    return {
      code,
      format: 'holo',
      source: 'ai',
      provider: aiResult.provider,
      traits: aiResult.detectedTraits,
    };
  }

  return {
    code: `composition "SemanticApp" {
  object "Root" {
    @2d_canvas { projection: "flat-semantic" }
    @semantic_layout { flow: "column" }
    
    object "Element" {
      @semantic_entity { type: "container" }
      @dynamic_visual { color: "blue" }
    }
  }
}`,
    format: 'holo',
    source: 'heuristic',
  };
}
