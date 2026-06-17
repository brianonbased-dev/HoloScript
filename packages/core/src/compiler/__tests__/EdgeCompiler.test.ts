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

  it('adds a colcon ROS2 bridge package when ros2_actuation trait is present', () => {
    // Peer b2d3a1af0 replaced standalone ros2_bridge.py with a colcon
    // ament_python package (ros2_ws/src/<pkg>_bridge/.../bridge.py).
    const result = compiler.compile(minimalComposition('ros-agent', ['ros2_actuation']), token);
    const bundle = JSON.parse(result);
    const paths: string[] = bundle.files.map((f: { path: string }) => f.path);
    expect(paths.some((p) => p.endsWith('/bridge.py'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/package.xml'))).toBe(true);
    expect(bundle.config.hasROS2).toBe(true);
  });

  it('does NOT add a ROS2 bridge without ros2 trait', () => {
    const result = compiler.compile(minimalComposition('plain-agent'), token);
    const bundle = JSON.parse(result);
    const paths: string[] = bundle.files.map((f: { path: string }) => f.path);
    expect(paths.some((p) => p.endsWith('/bridge.py'))).toBe(false);
    expect(paths.some((p) => p.endsWith('/package.xml'))).toBe(false);
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

  // ── Native AgentRunner runtime (the deploy artifact is @generated, not hand-written) ──

  it('default runtime is python (agent.py present, config.runtime=python)', () => {
    const result = compiler.compile(minimalComposition('py-default'), token);
    const bundle = JSON.parse(result);
    expect(bundle.config.runtime).toBe('python');
    const paths = bundle.files.map((f: { path: string }) => f.path);
    expect(paths).toContain('agent.py');
  });

  it('agentrunner runtime generates a node AgentRunner unit, not the python agent', () => {
    const ar = new EdgeCompiler({
      ollamaUrl: 'http://127.0.0.1:11434',
      model: 'qwen3:4b-instruct',
      runtime: 'agentrunner',
    });
    const result = ar.compile(
      minimalComposition('jetson-orin-01', ['local_inference', 'edge_node', 'sovereign_agent']),
      token,
    );
    const bundle = JSON.parse(result);
    expect(bundle.config.runtime).toBe('agentrunner');
    const paths: string[] = bundle.files.map((f: { path: string }) => f.path);
    // TS AgentRunner IS the runtime — no generated Python agent loop.
    expect(paths).toContain('holoscript_agent.service');
    expect(paths).not.toContain('agent.py');
    const svc = bundle.files.find((f: { path: string }) => f.path === 'holoscript_agent.service');
    expect(svc?.content).toContain('index.js run'); // runForever (canonical AgentRunner)
    expect(svc?.content).toContain('Restart=always'); // survives reboot
    expect(svc?.content).toContain('EnvironmentFile'); // secret by path, not inlined (F.106)
    expect(svc?.content).not.toContain('python3'); // gate stack preserved, no thin Python loop
    const manifest = bundle.files.find((f: { path: string }) => f.path === 'manifest.json');
    expect(manifest?.content).toContain('"runtime": "agentrunner"');
  });
});
