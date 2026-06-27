import { createHash } from 'crypto';

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloPolicyPackBlock,
  HoloValue,
} from '../parser/HoloCompositionTypes';

export type OmnigentProjectionTarget = 'omnigent-agent-yaml';

export type OmnigentWarningCode =
  | 'inline_secret_auth'
  | 'windows_sandbox_degraded'
  | 'function_tool_unowned_schema'
  | 'policy_missing_holoscript_provenance';

export interface OmnigentProjectionWarning {
  code: OmnigentWarningCode;
  message: string;
  source: string;
}

export interface OmnigentProjectionReceipt {
  source: string;
  target: OmnigentProjectionTarget;
  sourceHash: string;
  projectionHash: string;
  warnings: OmnigentProjectionWarning[];
  emittedFiles: string[];
  semantics: {
    exportOnly: true;
    secretCustody: 'provider-or-env-reference-only';
    windowsSandbox: 'degraded-when-native-runtime-requested';
  };
}

export interface OmnigentAgentYamlResult {
  agentYaml: string;
  receipt: OmnigentProjectionReceipt;
}

export interface OmnigentAgentYamlCompilerOptions {
  source?: string;
  harness?: string;
  defaultProvider?: string;
  defaultModel?: string;
  authEnv?: string;
}

interface TraitRef {
  source: string;
  trait: HoloObjectTrait;
  name: string;
  config: Record<string, unknown>;
}

interface AgentProjection {
  yamlObject: Record<string, unknown>;
  warnings: OmnigentProjectionWarning[];
}

const TARGET: OmnigentProjectionTarget = 'omnigent-agent-yaml';

const AGENT_TRAITS = new Set(['agent', 'llm_agent']);
const MODEL_TRAITS = new Set(['model', 'inference']);
const SYSTEM_PROMPT_TRAITS = new Set(['system_prompt', 'prompt', 'instructions']);
const FUNCTION_TOOL_TRAITS = new Set(['tool', 'tool_use', 'function_tool', 'typed_tool']);
const MCP_TOOL_TRAITS = new Set(['mcp', 'mcp_connector', 'connector']);
const CHILD_AGENT_TRAITS = new Set(['child_agent', 'agent_tool', 'delegate_agent']);
const POLICY_TRAITS = new Set(['policy', 'policy_handler', 'governance', 'content_policy']);
const RUNTIME_TRAITS = new Set(['runtime', 'local_execution', 'sandbox', 'terminal']);

const SECRET_KEY_RE = /(^|[_-])(api[_-]?key|token|secret|password|credential|bearer|auth)([_-]|$)/i;
const INLINE_SECRET_VALUE_RE =
  /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|ghp_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{8,}|-----BEGIN\s+(?:RSA\s+)?PRIVATE KEY-----)/;

export class OmnigentAgentYamlCompiler extends CompilerBase {
  protected readonly compilerName = 'OmnigentAgentYamlCompiler';

  private readonly options: OmnigentAgentYamlCompilerOptions;

  constructor(options: OmnigentAgentYamlCompilerOptions = {}) {
    super();
    this.options = options;
  }

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.OMNIGENT_AGENT_YAML;
  }

  compile(
    composition: HoloComposition,
    agentToken = '',
    outputPath?: string
  ): OmnigentAgentYamlResult {
    this.validateCompilerAccess(agentToken, outputPath);

    const source = this.options.source ?? composition.name ?? 'agent.holo-or-hsplus';
    const projection = this.projectComposition(composition, source);
    const agentYaml = toYaml(projection.yamlObject);
    const receipt: OmnigentProjectionReceipt = {
      source,
      target: TARGET,
      sourceHash: sha256Label(stableStringify(composition)),
      projectionHash: sha256Label(agentYaml),
      warnings: projection.warnings,
      emittedFiles: ['generated-agent.yaml', 'omnigent-projection-receipt.json'],
      semantics: {
        exportOnly: true,
        secretCustody: 'provider-or-env-reference-only',
        windowsSandbox: 'degraded-when-native-runtime-requested',
      },
    };

    return { agentYaml, receipt };
  }

  override compileToFiles(composition: HoloComposition, agentToken = ''): Record<string, string> {
    const result = this.compile(composition, agentToken);
    return {
      'generated-agent.yaml': result.agentYaml,
      'omnigent-projection-receipt.json': JSON.stringify(result.receipt, null, 2),
    };
  }

  protected override defaultOutputFileName(): string {
    return 'generated-agent.yaml';
  }

  private projectComposition(composition: HoloComposition, source: string): AgentProjection {
    const warnings: OmnigentProjectionWarning[] = [];
    const objects = collectObjects(composition);
    const traitRefs = collectTraitRefs(composition, objects);
    this.collectSecretWarnings(traitRefs, warnings);

    const primaryObject = findPrimaryAgentObject(objects) ?? objects[0];
    const primaryTraits = [
      ...(composition.traits ?? []),
      ...(primaryObject?.traits ?? []),
    ].map((trait) => toTraitRef(primaryObject?.name ?? 'composition', trait));

    const agentTrait = firstTrait(primaryTraits, AGENT_TRAITS);
    const modelTrait = firstTrait(primaryTraits, MODEL_TRAITS);
    const systemPromptTrait = firstTrait(primaryTraits, SYSTEM_PROMPT_TRAITS);

    const agentConfig = agentTrait?.config ?? {};
    const modelConfig = modelTrait?.config ?? {};
    const provider =
      stringFrom(modelConfig['provider']) ?? this.options.defaultProvider ?? 'openai';
    const modelName =
      stringFrom(modelConfig['name']) ??
      stringFrom(modelConfig['model']) ??
      this.options.defaultModel ??
      'gpt-4o';
    const agentName =
      stringFrom(agentConfig['name']) ??
      stringFrom(agentConfig['id']) ??
      primaryObject?.name ??
      composition.name;
    const description =
      stringFrom(agentConfig['description']) ??
      stringFrom(metadataValue(composition, 'description')) ??
      `HoloScript projection for ${composition.name}`;
    const instructions =
      stringFrom(systemPromptTrait?.config['text']) ??
      stringFrom(systemPromptTrait?.config['content']) ??
      stringFrom(agentConfig['instructions']) ??
      stringFrom(agentConfig['prompt']) ??
      'Follow the HoloScript-authored agent contract and preserve projection receipts.';

    const tools = this.buildTools(traitRefs, warnings);
    const policies = this.buildPolicies(composition.policyPacks ?? [], traitRefs, warnings);
    const runtime = this.buildRuntime(traitRefs, warnings);
    const affordances = this.buildAffordances(traitRefs);
    const authEnv = this.resolveAuthEnv(provider, modelConfig);

    const yamlObject = compactObject({
      name: agentName,
      description,
      instructions,
      executor: {
        harness: this.options.harness ?? stringFrom(agentConfig['harness']) ?? 'codex',
        model: {
          provider,
          name: modelName,
        },
        auth: {
          provider: 'env',
          env: authEnv,
        },
      },
      tools: tools.length > 0 ? tools : undefined,
      policies: policies.length > 0 ? policies : undefined,
      runtime: Object.keys(runtime).length > 0 ? runtime : undefined,
      affordances: Object.keys(affordances).length > 0 ? affordances : undefined,
      metadata: {
        source,
        target: TARGET,
        generator: 'HoloScript OmnigentAgentYamlCompiler',
      },
    });

    return { yamlObject, warnings };
  }

  private buildTools(
    traitRefs: TraitRef[],
    warnings: OmnigentProjectionWarning[]
  ): Array<Record<string, unknown>> {
    const tools: Array<Record<string, unknown>> = [];

    for (const ref of traitRefs) {
      if (FUNCTION_TOOL_TRAITS.has(ref.name)) {
        const schema = schemaFromToolConfig(ref.config);
        if (!hasHoloOwnedSchema(ref.config)) {
          pushWarning(warnings, {
            code: 'function_tool_unowned_schema',
            source: ref.source,
            message: `Function tool '${toolName(ref)}' lacks a HoloScript-owned schema receipt or owner.`,
          });
        }
        tools.push(
          compactObject({
            type: 'function',
            name: toolName(ref),
            description:
              stringFrom(ref.config['description']) ??
              `Function tool projected from HoloScript trait ${ref.trait.name}`,
            schema,
          })
        );
        continue;
      }

      if (MCP_TOOL_TRAITS.has(ref.name)) {
        tools.push(
          compactObject({
            type: 'mcp',
            name: toolName(ref),
            server:
              stringFrom(ref.config['server']) ??
              stringFrom(ref.config['url']) ??
              stringFrom(ref.config['endpoint']),
            transport: stringFrom(ref.config['transport']) ?? 'mcp',
            tool: stringFrom(ref.config['tool']),
          })
        );
        continue;
      }

      if (CHILD_AGENT_TRAITS.has(ref.name)) {
        tools.push(
          compactObject({
            type: 'agent',
            name: toolName(ref),
            description:
              stringFrom(ref.config['description']) ??
              `Child agent projected from ${ref.source}`,
          })
        );
      }
    }

    return tools;
  }

  private buildPolicies(
    policyPacks: HoloPolicyPackBlock[],
    traitRefs: TraitRef[],
    warnings: OmnigentProjectionWarning[]
  ): Array<Record<string, unknown>> {
    const policies: Array<Record<string, unknown>> = policyPacks.map((pack) =>
      compactObject({
        name: pack.name,
        version: pack.version,
        framework: pack.frameworkId,
        provenance: `holoscript:policy_pack:${pack.name}`,
      })
    );

    for (const ref of traitRefs) {
      if (!POLICY_TRAITS.has(ref.name)) continue;

      if (ref.config['handler'] && !hasHoloProvenance(ref.config)) {
        pushWarning(warnings, {
          code: 'policy_missing_holoscript_provenance',
          source: ref.source,
          message: `Policy handler '${toolName(ref)}' lacks HoloScript governance-frame provenance.`,
        });
      }

      policies.push(
        compactObject({
          name: toolName(ref),
          handler: stringFrom(ref.config['handler']),
          framework:
            stringFrom(ref.config['framework']) ??
            stringFrom(ref.config['frame']) ??
            stringFrom(ref.config['governance_frame']),
          provenance:
            stringFrom(ref.config['provenance']) ??
            stringFrom(ref.config['receipt']) ??
            stringFrom(ref.config['receipt_ref']) ??
            stringFrom(ref.config['source_ref']),
        })
      );
    }

    return policies;
  }

  private buildRuntime(
    traitRefs: TraitRef[],
    warnings: OmnigentProjectionWarning[]
  ): Record<string, unknown> {
    const runtime: Record<string, unknown> = {};

    for (const ref of traitRefs) {
      if (!RUNTIME_TRAITS.has(ref.name)) continue;
      const config = ref.config;
      const platform = lowerString(config['platform']) ?? lowerString(config['os']);
      const wantsWindows = platform?.includes('windows') || config['windows'] === true;
      const wantsSandbox =
        config['sandbox'] === true ||
        config['isolation'] === true ||
        config['sandbox_guarantee'] === true;

      if (wantsWindows && wantsSandbox) {
        pushWarning(warnings, {
          code: 'windows_sandbox_degraded',
          source: ref.source,
          message:
            'Windows native runtime requested a sandbox guarantee; Omnigent treats this as degraded.',
        });
      }

      runtime.os_env = compactObject({
        platform: stringFrom(config['platform']) ?? stringFrom(config['os']),
        sandbox: wantsWindows && wantsSandbox ? 'degraded' : config['sandbox'],
      });
      runtime.terminals =
        stringFrom(config['terminal']) ??
        stringFrom(config['shell']) ??
        (config['native'] === true ? 'native' : undefined);
    }

    return compactObject(runtime);
  }

  private buildAffordances(traitRefs: TraitRef[]): Record<string, unknown> {
    const affordances: Record<string, unknown> = {};
    for (const ref of traitRefs) {
      if (ref.name === 'async' || ref.config['async'] === true) affordances.async = true;
      if (ref.name === 'cancel' || ref.name === 'cancellation' || ref.config['cancel'] === true) {
        affordances.cancel = true;
      }
      if (ref.name === 'timer' || ref.name === 'timers' || ref.config['timers'] === true) {
        affordances.timers = true;
      }
    }
    return affordances;
  }

  private resolveAuthEnv(provider: string, modelConfig: Record<string, unknown>): string {
    const authObject = isRecord(modelConfig['auth']) ? modelConfig['auth'] : {};
    return (
      this.options.authEnv ??
      stringFrom(modelConfig['auth_env']) ??
      stringFrom(modelConfig['api_key_env']) ??
      stringFrom(authObject['env']) ??
      defaultAuthEnv(provider)
    );
  }

  private collectSecretWarnings(
    traitRefs: TraitRef[],
    warnings: OmnigentProjectionWarning[]
  ): void {
    for (const ref of traitRefs) {
      scanInlineSecrets(ref.config, ref.source, warnings);
    }
    scanInlineSecrets(this.options as Record<string, unknown>, 'compiler-options', warnings);
  }
}

export function createOmnigentAgentYamlCompiler(
  options: OmnigentAgentYamlCompilerOptions = {}
): OmnigentAgentYamlCompiler {
  return new OmnigentAgentYamlCompiler(options);
}

function collectObjects(composition: HoloComposition): HoloObjectDecl[] {
  const out: HoloObjectDecl[] = [];
  const visit = (object: HoloObjectDecl): void => {
    out.push(object);
    for (const child of object.children ?? []) visit(child);
  };
  for (const object of composition.objects ?? []) visit(object);
  for (const scene of composition.scenes ?? []) {
    for (const object of scene.objects ?? []) visit(object);
  }
  return out;
}

function collectTraitRefs(composition: HoloComposition, objects: HoloObjectDecl[]): TraitRef[] {
  const refs = (composition.traits ?? []).map((trait) => toTraitRef('composition', trait));
  for (const object of objects) {
    for (const trait of object.traits ?? []) refs.push(toTraitRef(object.name, trait));
  }
  return refs;
}

function toTraitRef(source: string, trait: HoloObjectTrait): TraitRef {
  return {
    source,
    trait,
    name: normalizeTraitName(trait.name),
    config: toUnknownRecord(trait.config ?? trait.params ?? {}),
  };
}

function findPrimaryAgentObject(objects: HoloObjectDecl[]): HoloObjectDecl | undefined {
  return objects.find((object) =>
    (object.traits ?? []).some((trait) => AGENT_TRAITS.has(normalizeTraitName(trait.name)))
  );
}

function firstTrait(refs: TraitRef[], names: ReadonlySet<string>): TraitRef | undefined {
  return refs.find((ref) => names.has(ref.name));
}

function normalizeTraitName(name: string): string {
  return name.replace(/^@/, '').replace(/-/g, '_').toLowerCase();
}

function toUnknownRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? (value as Record<string, unknown>) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringFrom(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function lowerString(value: unknown): string | undefined {
  return stringFrom(value)?.toLowerCase();
}

function metadataValue(composition: HoloComposition, key: string): HoloValue | undefined {
  return composition.metadata?.[key];
}

function toolName(ref: TraitRef): string {
  return (
    stringFrom(ref.config['name']) ??
    stringFrom(ref.config['id']) ??
    stringFrom(ref.config['tool']) ??
    `${ref.source}_${ref.name}`
  );
}

function schemaFromToolConfig(config: Record<string, unknown>): unknown {
  if (config['schema']) return config['schema'];
  if (config['input_schema']) return config['input_schema'];
  const parameters = config['parameters'];
  if (!Array.isArray(parameters)) return undefined;

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const parameter of parameters) {
    if (!isRecord(parameter)) continue;
    const name = stringFrom(parameter['name']);
    if (!name) continue;
    properties[name] = compactObject({
      type: stringFrom(parameter['type']) ?? 'string',
      description: stringFrom(parameter['description']),
    });
    if (parameter['required'] === true) required.push(name);
  }

  return compactObject({
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  });
}

function hasHoloOwnedSchema(config: Record<string, unknown>): boolean {
  const owner =
    stringFrom(config['schema_owner']) ??
    stringFrom(config['schemaOwner']) ??
    stringFrom(config['schema_ref']) ??
    stringFrom(config['schema_receipt']) ??
    stringFrom(config['receipt_ref']);
  return owner ? /holo|receipt|schema/i.test(owner) : false;
}

function hasHoloProvenance(config: Record<string, unknown>): boolean {
  const refs = [
    config['provenance'],
    config['receipt'],
    config['receipt_ref'],
    config['source_ref'],
    config['governance_frame'],
    config['frame_receipt'],
    config['policy_pack'],
  ];
  return refs.some((value) => {
    const ref = stringFrom(value);
    return ref ? /holo|receipt|prov|policy_pack/i.test(ref) : false;
  });
}

function scanInlineSecrets(
  value: unknown,
  source: string,
  warnings: OmnigentProjectionWarning[],
  path: string[] = []
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanInlineSecrets(item, source, warnings, [...path, String(index)]));
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (typeof child === 'string') {
      const secretByKey = SECRET_KEY_RE.test(key) && !isEnvReference(child);
      const secretByValue = !isEnvReference(child) && INLINE_SECRET_VALUE_RE.test(child);
      if (secretByKey || secretByValue) {
        pushWarning(warnings, {
          code: 'inline_secret_auth',
          source,
          message: `Inline secret-like auth value at ${nextPath.join('.')} must be replaced by a provider or env reference.`,
        });
      }
    }
    scanInlineSecrets(child, source, warnings, nextPath);
  }
}

function isEnvReference(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^env:[A-Z0-9_]+$/i.test(trimmed) ||
    /^\$\{[A-Z0-9_]+\}$/.test(trimmed) ||
    /^process\.env\.[A-Z0-9_]+$/i.test(trimmed) ||
    /^[A-Z][A-Z0-9_]{5,}$/.test(trimmed)
  );
}

function pushWarning(
  warnings: OmnigentProjectionWarning[],
  warning: OmnigentProjectionWarning
): void {
  const key = `${warning.code}:${warning.source}:${warning.message}`;
  if (!warnings.some((existing) => `${existing.code}:${existing.source}:${existing.message}` === key)) {
    warnings.push(warning);
  }
}

function defaultAuthEnv(provider: string): string {
  const normalized = provider.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (normalized === 'openai') return 'OPENAI_API_KEY';
  if (normalized === 'anthropic') return 'ANTHROPIC_API_KEY';
  if (normalized === 'gemini' || normalized === 'google') return 'GOOGLE_API_KEY';
  return `${normalized.toUpperCase()}_API_KEY`;
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    if (Array.isArray(child) && child.length === 0) continue;
    if (isRecord(child)) {
      const nested = compactObject(child);
      if (Object.keys(nested).length === 0) continue;
      out[key] = nested;
      continue;
    }
    out[key] = child;
  }
  return out;
}

function sha256Label(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function toYaml(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) =>
        isScalar(item)
          ? `${pad}- ${yamlScalar(item)}`
          : `${pad}-\n${toYaml(item, indent + 2)}`
      )
      .join('\n');
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, child]) => child !== undefined);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([key, child]) => {
        if (isScalar(child)) return `${pad}${key}: ${yamlScalar(child)}`;
        return `${pad}${key}:\n${toYaml(child, indent + 2)}`;
      })
      .join('\n');
  }

  return `${pad}${yamlScalar(value)}`;
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (text.includes('\n')) {
    const lines = text.split(/\r?\n/).map((line) => `  ${line}`);
    return `|-\n${lines.join('\n')}`;
  }
  if (/^[A-Za-z0-9_.:/@+-]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
