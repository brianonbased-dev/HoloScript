import { describe, it, expect } from 'vitest';
import { EdgeCompiler } from '../EdgeCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function minimalComposition(name: string, traits: string[] = []): HoloComposition {
  return {
    type: 'Composition',
    name,
    traits: traits.map((t) => ({ type: 'ObjectTrait', name: t, config: {}, args: [] })),
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
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

describe('EdgeCompiler', () => {
  const token = createTestCompilerToken();
  const compiler = new EdgeCompiler({ ollamaUrl: 'http://localhost:11434', model: 'qwen3:4b' });

  it('emits a valid JSON bundle for a bare composition', () => {
    const result = compiler.compile(minimalComposition('test-agent'), token);
    const bundle = JSON.parse(result);
    expect(bundle.target).toBe('edge');
    expect(bundle.name).toBe('test-agent');
    expect(bundle.files).toBeInstanceOf(Array);
    expect(bundle.files.length).toBeGreaterThanOrEqual(4);
  });

  it('always includes agent.py, monitor.py, setup.sh, holoscript_agent.service', () => {
    const result = compiler.compile(minimalComposition('my-node'), token);
    const bundle = JSON.parse(result);
    const paths = bundle.files.map((f: { path: string }) => f.path);
    expect(paths).toContain('agent.py');
    expect(paths).toContain('monitor.py');
    expect(paths).toContain('setup.sh');
    expect(paths).toContain('holoscript_agent.service');
  });

  it('adds ros2_bridge.py when ros2_actuation trait is present', () => {
    const result = compiler.compile(minimalComposition('ros-agent', ['ros2_actuation']), token);
    const bundle = JSON.parse(result);
    const paths = bundle.files.map((f: { path: string }) => f.path);
    expect(paths).toContain('ros2_bridge.py');
    expect(bundle.config.hasROS2).toBe(true);
  });

  it('does NOT add ros2_bridge.py without ros2 trait', () => {
    const result = compiler.compile(minimalComposition('plain-agent'), token);
    const bundle = JSON.parse(result);
    const paths = bundle.files.map((f: { path: string }) => f.path);
    expect(paths).not.toContain('ros2_bridge.py');
    expect(bundle.config.hasROS2).toBe(false);
  });

  it('adds tensorrt_loader.py for @TensorRTInference trait', () => {
    const result = compiler.compile(minimalComposition('trt-agent', ['tensorrt_inference']), token);
    const bundle = JSON.parse(result);
    const paths = bundle.files.map((f: { path: string }) => f.path);
    expect(paths).toContain('tensorrt_loader.py');
    expect(bundle.config.hasTensorRT).toBe(true);
  });

  it('detects jetson trait and sets hasJetsonGPU', () => {
    const result = compiler.compile(minimalComposition('jetson-agent', ['jetson']), token);
    const bundle = JSON.parse(result);
    expect(bundle.config.hasJetsonGPU).toBe(true);
  });

  it('detects tegrastats trait and sets hasTegraMonitor', () => {
    const result = compiler.compile(minimalComposition('tegra-agent', ['tegrastats']), token);
    const bundle = JSON.parse(result);
    expect(bundle.config.hasTegraMonitor).toBe(true);
  });

  it('full Jetson brain traits set all flags', () => {
    const jetsonTraits = ['local_inference', 'edge_node', 'sovereign_agent', 'jetson', 'tegrastats', 'ros2_actuation'];
    const result = compiler.compile(minimalComposition('jetson-orin-01', jetsonTraits), token);
    const bundle = JSON.parse(result);
    expect(bundle.config.hasLocalInference).toBe(true);
    expect(bundle.config.hasEdgeNode).toBe(true);
    expect(bundle.config.hasJetsonGPU).toBe(true);
    expect(bundle.config.hasTegraMonitor).toBe(true);
    expect(bundle.config.hasROS2).toBe(true);
  });

  it('generated agent.py contains OLLAMA_URL env variable', () => {
    const result = compiler.compile(minimalComposition('env-agent'), token);
    const bundle = JSON.parse(result);
    const agentFile = bundle.files.find((f: { path: string }) => f.path === 'agent.py');
    expect(agentFile?.content).toContain('OLLAMA_URL');
  });

  it('generated systemd service contains composition name', () => {
    const result = compiler.compile(minimalComposition('my-edge-node'), token);
    const bundle = JSON.parse(result);
    const svc = bundle.files.find((f: { path: string }) => f.path === 'holoscript_agent.service');
    expect(svc?.content).toContain('my-edge-node');
  });

  it('respects ollamaUrl option in generated files', () => {
    const custom = new EdgeCompiler({ ollamaUrl: 'http://192.168.0.119:11434' });
    const result = custom.compile(minimalComposition('custom-url'), token);
    const bundle = JSON.parse(result);
    const agentFile = bundle.files.find((f: { path: string }) => f.path === 'agent.py');
    expect(agentFile?.content).toContain('192.168.0.119:11434');
  });
});
