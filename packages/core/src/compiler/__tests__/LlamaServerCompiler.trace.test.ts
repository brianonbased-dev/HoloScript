import { describe, expect, it } from 'vitest';
import { LlamaServerCompiler, type LlamaServerBundle } from '../LlamaServerCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import type {
  HoloComposition,
  HoloObjectTrait,
  HoloValue,
} from '../../parser/HoloCompositionTypes';

const token = createTestCompilerToken();

function llamaTrait(config: Record<string, HoloValue>): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name: 'llama_serve',
    config,
    args: [],
  };
}

function composition(traitConfig: Record<string, HoloValue>): HoloComposition {
  return {
    type: 'Composition',
    name: 'trace-capture-node',
    traits: [llamaTrait(traitConfig)],
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    transitions: [],
    timelines: [],
    audio: [],
    zones: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    imports: [],
    conditionals: [],
    iterators: [],
  } as unknown as HoloComposition;
}

const baseConfig: Record<string, HoloValue> = {
  model: 'brittney-edge:v0-4',
  model_path: '/opt/holoscript/models/qwen3-4b-instruct.gguf',
  vision: false,
  host: '192.168.0.119',
  port: 18080,
  platform: 'linux',
  executable: '/opt/holoscript/llama.cpp/build-holo/bin/llama-server',
  node: 'jetson-orin',
  register_as: 'jetson-orin-llamacpp',
};

function compile(config: Record<string, HoloValue>): LlamaServerBundle {
  const compiler = new LlamaServerCompiler();
  return JSON.parse(compiler.compile(composition(config), token)) as LlamaServerBundle;
}

describe('LlamaServerCompiler trace_capture', () => {
  it('is OFF by default: no proxy artifacts, server binds the public address', () => {
    const bundle = compile(baseConfig);
    expect(bundle.config.traceCapture).toBe(false);
    expect(bundle.registryEntry.capabilities.traceCapture).toBe(false);
    expect(bundle.files.some((f) => f.path.includes('holo-inference-proxy'))).toBe(false);
    expect(bundle.launch.args.join(' ')).toContain('192.168.0.119');
    expect(bundle.launch.args.join(' ')).toContain('18080');
  });

  it('rebinds llama-server to loopback upstream and emits proxy script + unit when enabled', () => {
    const bundle = compile({ ...baseConfig, trace_capture: true });

    // llama-server itself moves to loopback:port-1
    const argLine = bundle.launch.args.join(' ');
    expect(argLine).toContain('127.0.0.1');
    expect(argLine).toContain('18079');
    expect(argLine).not.toContain('192.168.0.119');
    expect(bundle.service.systemdUnit).toContain('127.0.0.1');

    // proxy artifacts exist
    const proxyScript = bundle.files.find((f) => f.path === 'holo-inference-proxy.mjs');
    const proxyUnit = bundle.files.find(
      (f) => f.path === 'holo-inference-proxy-jetson-orin-llamacpp.service'
    );
    expect(proxyScript).toBeDefined();
    expect(proxyScript?.executable).toBe(true);
    expect(proxyUnit).toBeDefined();

    // proxy owns the PUBLIC bind and points at the loopback upstream
    expect(proxyUnit?.content).toContain('HOLO_PROXY_BIND_HOST=192.168.0.119');
    expect(proxyUnit?.content).toContain('HOLO_PROXY_BIND_PORT=18080');
    expect(proxyUnit?.content).toContain('HOLO_PROXY_UPSTREAM=http://127.0.0.1:18079');
    expect(proxyUnit?.content).toContain('Restart=always');
    expect(proxyUnit?.content).toContain(
      'After=network-online.target jetson-orin-llamacpp.service'
    );

    // receipt/capsule contract is baked into the script
    expect(proxyScript?.content).toContain('inference-receipt/v0');
    expect(proxyScript?.content).toContain("source: 'inference-proxy'");
    expect(proxyScript?.content).toContain('unattributed');
  });

  it('keeps every public-facing surface on the declared host:port', () => {
    const bundle = compile({ ...baseConfig, trace_capture: true });
    expect(bundle.healthProbe.url).toContain('192.168.0.119:18080');
    expect(bundle.registryEntry.endpoint).toContain('192.168.0.119:18080');
    expect(bundle.registryEntry.healthUrl).toContain('192.168.0.119:18080');
    expect(bundle.registryEntry.capabilities.traceCapture).toBe(true);
    const registryDoc = bundle.files.find((f) => f.path.startsWith('sovereign-devices/'));
    expect(registryDoc?.content).toContain('192.168.0.119:18080');
    expect(registryDoc?.content).not.toContain('18079');
  });

  it('honors explicit trace field overrides', () => {
    const bundle = compile({
      ...baseConfig,
      trace_capture: true,
      trace_upstream_port: 18070,
      attribution_header: 'X-Custom-Agent',
      trace_receipts_dir: '/data/receipts',
      trace_capsules_dir: '/data/capsules',
      trace_capsule_daily_mb: 64,
    });
    expect(bundle.config.traceUpstreamPort).toBe(18070);
    const unit = bundle.files.find((f) => f.path.startsWith('holo-inference-proxy-'));
    expect(unit?.content).toContain('HOLO_PROXY_UPSTREAM=http://127.0.0.1:18070');
    expect(unit?.content).toContain('HOLO_PROXY_ATTRIBUTION_HEADER=X-Custom-Agent');
    expect(unit?.content).toContain('HOLO_PROXY_RECEIPTS_DIR=/data/receipts');
    expect(unit?.content).toContain('HOLO_PROXY_CAPSULES_DIR=/data/capsules');
    expect(unit?.content).toContain('HOLO_PROXY_CAPSULE_DAILY_MB=64');
  });

  it('warns on windows (proxy unit is systemd-only)', () => {
    const bundle = compile({
      ...baseConfig,
      trace_capture: true,
      platform: 'windows',
      executable:
        'C:\\Users\\josep\\Documents\\GitHub\\llama.cpp\\build-holo\\bin\\Release\\llama-server.exe',
    });
    expect(bundle.warnings.some((w) => w.includes('systemd proxy unit'))).toBe(true);
  });

  it('throws when the upstream port collides with the public port', () => {
    const compiler = new LlamaServerCompiler();
    expect(() =>
      compiler.compile(
        composition({ ...baseConfig, trace_capture: true, trace_upstream_port: 18080 }),
        token
      )
    ).toThrow(/differ from the public port/);
  });
});
