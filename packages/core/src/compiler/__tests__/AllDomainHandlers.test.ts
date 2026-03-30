/**
 * AllDomainHandlers.test.ts
 * Tests for all 10 remaining domain block handlers + cross-platform transpilers.
 * Covers: IoT, DataViz, Education, Music, Architecture, Web3, Procedural, Rendering, Navigation, Input
 */

import { describe, it, expect, vi } from 'vitest';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';
import {
  compileIoTBlock,
  iotToR3F,
  iotToUnity,
  iotToGodot,
  iotToVRChat,
  iotToUSDA,
  compileDataVizBlock,
  datavizToR3F,
  datavizToUnity,
  datavizToGodot,
  datavizToVRChat,
  datavizToUSDA,
  compileEducationBlock,
  educationToR3F,
  educationToUnity,
  educationToGodot,
  educationToVRChat,
  educationToUSDA,
  compileMusicBlock,
  musicToR3F,
  musicToUnity,
  musicToGodot,
  musicToVRChat,
  musicToUSDA,
  compileArchitectureBlock,
  architectureToR3F,
  architectureToUnity,
  architectureToGodot,
  architectureToVRChat,
  architectureToUSDA,
  compileWeb3Block,
  web3ToR3F,
  web3ToUnity,
  web3ToGodot,
  web3ToVRChat,
  web3ToUSDA,
  compileProceduralBlock,
  proceduralToR3F,
  proceduralToUnity,
  proceduralToGodot,
  proceduralToVRChat,
  proceduralToUSDA,
  compileRenderingBlock,
  renderingToR3F,
  renderingToUnity,
  renderingToGodot,
  renderingToVRChat,
  renderingToUSDA,
  compileNavigationBlock,
  navigationToR3F,
  navigationToUnity,
  navigationToGodot,
  navigationToVRChat,
  navigationToUSDA,
  compileInputBlock,
  inputToR3F,
  inputToUnity,
  inputToGodot,
  inputToVRChat,
  inputToUSDA,
} from '../DomainBlockCompilerMixin';

// Mock RBAC
vi.mock('../../compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as any), getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }) };
});

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeBlock(
  domain: string,
  keyword: string,
  name: string,
  props: Record<string, any> = {},
  children: any[] = [],
  traits: string[] = []
): HoloDomainBlock {
  return {
    type: 'DomainBlock',
    domain: domain as any,
    keyword,
    name,
    properties: props,
    children: children.map((c) => ({ type: 'DomainBlock', ...c })),
    traits,
  };
}

// =============================================================================
// IoT Domain
// =============================================================================

describe('IoT Domain', () => {
  const sensorBlock = makeBlock('iot', 'sensor', 'TempSensor', {
    device_type: 'sensor',
    protocol: 'mqtt',
    telemetry_fields: ['temperature', 'humidity'],
    update_interval: 5000,
    twin_model: 'sensor_v2.glb',
  });

  it('compileIoTBlock extracts device properties', () => {
    const ir = compileIoTBlock(sensorBlock);
    expect(ir.name).toBe('TempSensor');
    expect(ir.keyword).toBe('sensor');
    expect(ir.deviceType).toBe('sensor');
    expect(ir.protocol).toBe('mqtt');
    expect(ir.telemetryFields).toEqual(['temperature', 'humidity']);
    expect(ir.updateInterval).toBe(5000);
    expect(ir.twinModel).toBe('sensor_v2.glb');
  });

  it('compileIoTBlock extracts bindings', () => {
    const block = makeBlock('iot', 'binding', 'SensorBind', {
      bindings: { temperature: 'sensor.temp', humidity: 'sensor.hum' },
    });
    const ir = compileIoTBlock(block);
    expect(ir.bindings).toEqual({ temperature: 'sensor.temp', humidity: 'sensor.hum' });
  });

  it('compileIoTBlock handles single telemetry field string', () => {
    const block = makeBlock('iot', 'sensor', 'Simple', { telemetry_fields: 'pressure' });
    const ir = compileIoTBlock(block);
    expect(ir.telemetryFields).toEqual(['pressure']);
  });

  it('compileIoTBlock defaults for empty block', () => {
    const block = makeBlock('iot', 'device', 'Empty', {});
    const ir = compileIoTBlock(block);
    expect(ir.name).toBe('Empty');
    expect(ir.keyword).toBe('device');
    expect(ir.telemetryFields).toBeUndefined();
  });

  it('iotToR3F generates config', () => {
    const code = iotToR3F(compileIoTBlock(sensorBlock));
    expect(code).toContain('TempSensorConfig');
    expect(code).toContain('"mqtt"');
    expect(code).toContain('telemetryFields');
    expect(code).toContain('updateInterval: 5000');
  });

  it('iotToUnity generates C# class', () => {
    const code = iotToUnity(compileIoTBlock(sensorBlock));
    expect(code).toContain('class TempSensorIoT : MonoBehaviour');
    expect(code).toContain('protocol = "mqtt"');
    expect(code).toContain('telemetryFields');
  });

  it('iotToGodot generates GDScript', () => {
    const code = iotToGodot(compileIoTBlock(sensorBlock));
    expect(code).toContain('extends Node');
    expect(code).toContain('protocol: String = "mqtt"');
    expect(code).toContain('signal telemetry_received');
  });

  it('iotToVRChat generates UdonSharp', () => {
    const code = iotToVRChat(compileIoTBlock(sensorBlock));
    expect(code).toContain('UdonBehaviourSyncMode');
    expect(code).toContain('class TempSensorIoT');
    expect(code).toContain('[UdonSynced]');
  });

  it('iotToUSDA generates USD annotations', () => {
    const code = iotToUSDA(compileIoTBlock(sensorBlock));
    expect(code).toContain('def Scope "IoT_TempSensor"');
    expect(code).toContain('holoscript:protocol = "mqtt"');
  });
});

// =============================================================================
// DataViz Domain
// =============================================================================

describe('DataViz Domain', () => {
  const chartBlock = makeBlock('dataviz', 'chart', 'SalesChart', {
    chart_type: 'bar',
    data_source: '/api/sales',
    x_axis: 'month',
    y_axis: 'revenue',
    aggregation: 'sum',
    refresh_interval: 30000,
    width: 800,
    height: 600,
  });

  it('compileDataVizBlock extracts chart properties', () => {
    const ir = compileDataVizBlock(chartBlock);
    expect(ir.name).toBe('SalesChart');
    expect(ir.chartType).toBe('bar');
    expect(ir.dataSource).toBe('/api/sales');
    expect(ir.axes).toEqual({ x: 'month', y: 'revenue', z: undefined });
    expect(ir.aggregation).toBe('sum');
    expect(ir.refreshInterval).toBe(30000);
    expect(ir.dimensions).toEqual({ width: 800, height: 600 });
  });

  it('compileDataVizBlock extracts axes from nested object', () => {
    const block = makeBlock('dataviz', 'chart', 'Scatter3D', {
      axes: { x: 'lat', y: 'lon', z: 'altitude' },
    });
    const ir = compileDataVizBlock(block);
    expect(ir.axes).toEqual({ x: 'lat', y: 'lon', z: 'altitude' });
  });

  it('compileDataVizBlock defaults for empty block', () => {
    const block = makeBlock('dataviz', 'dashboard', 'Empty', {});
    const ir = compileDataVizBlock(block);
    expect(ir.name).toBe('Empty');
    expect(ir.chartType).toBeUndefined();
    expect(ir.dimensions).toBeUndefined();
  });

  it('datavizToR3F generates config', () => {
    const code = datavizToR3F(compileDataVizBlock(chartBlock));
    expect(code).toContain('SalesChartConfig');
    expect(code).toContain('"bar"');
    expect(code).toContain('dataSource');
  });

  it('datavizToUnity generates C# class', () => {
    const code = datavizToUnity(compileDataVizBlock(chartBlock));
    expect(code).toContain('class SalesChartDataViz : MonoBehaviour');
    expect(code).toContain('chartType = "bar"');
  });

  it('datavizToGodot generates GDScript', () => {
    const code = datavizToGodot(compileDataVizBlock(chartBlock));
    expect(code).toContain('extends Control');
    expect(code).toContain('chart_type: String = "bar"');
    expect(code).toContain('signal data_updated');
  });

  it('datavizToVRChat generates UdonSharp', () => {
    const code = datavizToVRChat(compileDataVizBlock(chartBlock));
    expect(code).toContain('class SalesChartDataViz');
    expect(code).toContain('[UdonSynced]');
  });

  it('datavizToUSDA generates USD annotations', () => {
    const code = datavizToUSDA(compileDataVizBlock(chartBlock));
    expect(code).toContain('def Scope "DataViz_SalesChart"');
    expect(code).toContain('holoscript:chartType = "bar"');
  });
});

// =============================================================================
// Education Domain
// =============================================================================

describe('Education Domain', () => {
  const quizBlock = makeBlock(
    'education',
    'quiz',
    'MathQuiz',
    {
      difficulty: 'intermediate',
      objectives: ['algebra', 'geometry'],
      duration: 30,
    },
    [
      {
        keyword: 'question',
        name: 'What is 2+2?',
        properties: { options: ['3', '4', '5'], answer: '4' },
      },
      { keyword: 'question', name: 'Area of circle?', properties: { answer: 'pi*r^2' } },
    ]
  );

  it('compileEducationBlock extracts quiz structure', () => {
    const ir = compileEducationBlock(quizBlock);
    expect(ir.name).toBe('MathQuiz');
    expect(ir.keyword).toBe('quiz');
    expect(ir.difficulty).toBe('intermediate');
    expect(ir.objectives).toEqual(['algebra', 'geometry']);
    expect(ir.duration).toBe(30);
    expect(ir.questions).toHaveLength(2);
    expect(ir.questions![0].question).toBe('What is 2+2?');
    expect(ir.questions![0].options).toEqual(['3', '4', '5']);
    expect(ir.questions![0].answer).toBe('4');
  });

  it('compileEducationBlock extracts prerequisites', () => {
    const block = makeBlock('education', 'lesson', 'Advanced', {
      prerequisites: ['intro', 'basics'],
    });
    const ir = compileEducationBlock(block);
    expect(ir.prerequisites).toEqual(['intro', 'basics']);
  });

  it('educationToR3F generates config', () => {
    const code = educationToR3F(compileEducationBlock(quizBlock));
    expect(code).toContain('MathQuizConfig');
    expect(code).toContain('"intermediate"');
    expect(code).toContain('objectives');
    expect(code).toContain('questions');
  });

  it('educationToUnity generates C# class', () => {
    const code = educationToUnity(compileEducationBlock(quizBlock));
    expect(code).toContain('class MathQuizEducation : MonoBehaviour');
    expect(code).toContain('difficulty = "intermediate"');
    expect(code).toContain('questionCount = 2');
  });

  it('educationToGodot generates GDScript', () => {
    const code = educationToGodot(compileEducationBlock(quizBlock));
    expect(code).toContain('extends Node');
    expect(code).toContain('difficulty: String = "intermediate"');
    expect(code).toContain('signal lesson_completed');
    expect(code).toContain('signal quiz_submitted');
  });

  it('educationToVRChat generates UdonSharp', () => {
    const code = educationToVRChat(compileEducationBlock(quizBlock));
    expect(code).toContain('class MathQuizEducation');
    expect(code).toContain('[UdonSynced] public int currentQuestion');
  });

  it('educationToUSDA generates USD annotations', () => {
    const code = educationToUSDA(compileEducationBlock(quizBlock));
    expect(code).toContain('def Scope "Education_MathQuiz"');
    expect(code).toContain('holoscript:difficulty = "intermediate"');
    expect(code).toContain('holoscript:durationMinutes = 30');
  });
});

// =============================================================================
// Music Domain
// =============================================================================

describe('Music Domain', () => {
  const instrumentBlock = makeBlock(
    'music',
    'instrument',
    'LeadSynth',
    {
      instrument_type: 'synth',
      bpm: 120,
      time_signature: [4, 4],
      key: 'Am',
      bars: 16,
    },
    [
      { keyword: 'effect', name: 'reverb', properties: {} },
      { keyword: 'effect', name: 'delay', properties: {} },
    ]
  );

  it('compileMusicBlock extracts instrument properties', () => {
    const ir = compileMusicBlock(instrumentBlock);
    expect(ir.name).toBe('LeadSynth');
    expect(ir.instrumentType).toBe('synth');
    expect(ir.bpm).toBe(120);
    expect(ir.timeSignature).toEqual([4, 4]);
    expect(ir.key).toBe('Am');
    expect(ir.bars).toBe(16);
    expect(ir.effects).toEqual(['reverb', 'delay']);
  });

  it('compileMusicBlock extracts effects from property', () => {
    const block = makeBlock('music', 'track', 'Beat', {
      effects: ['chorus', 'compressor'],
    });
    const ir = compileMusicBlock(block);
    expect(ir.effects).toEqual(['chorus', 'compressor']);
  });

  it('musicToR3F generates config', () => {
    const code = musicToR3F(compileMusicBlock(instrumentBlock));
    expect(code).toContain('LeadSynthConfig');
    expect(code).toContain('bpm: 120');
    expect(code).toContain('timeSignature: [4, 4]');
    expect(code).toContain('"Am"');
  });

  it('musicToUnity generates C# class', () => {
    const code = musicToUnity(compileMusicBlock(instrumentBlock));
    expect(code).toContain('class LeadSynthMusic : MonoBehaviour');
    expect(code).toContain('bpm = 120f');
    expect(code).toContain('musicalKey = "Am"');
  });

  it('musicToGodot generates GDScript', () => {
    const code = musicToGodot(compileMusicBlock(instrumentBlock));
    expect(code).toContain('extends Node');
    expect(code).toContain('bpm: float = 120');
    expect(code).toContain('signal beat');
    expect(code).toContain('signal bar_changed');
  });

  it('musicToVRChat generates UdonSharp', () => {
    const code = musicToVRChat(compileMusicBlock(instrumentBlock));
    expect(code).toContain('class LeadSynthMusic');
    expect(code).toContain('[UdonSynced] public float bpm');
  });

  it('musicToUSDA generates USD annotations', () => {
    const code = musicToUSDA(compileMusicBlock(instrumentBlock));
    expect(code).toContain('def Scope "Music_LeadSynth"');
    expect(code).toContain('holoscript:bpm = 120');
    expect(code).toContain('holoscript:key = "Am"');
  });
});

// =============================================================================
// Architecture Domain
// =============================================================================

describe('Architecture Domain', () => {
  const roomBlock = makeBlock('architecture', 'room', 'LivingRoom', {
    area: 35.5,
    height: 3.0,
    wall_material: 'concrete',
    floor_material: 'hardwood',
    temperature_setpoint: 22,
    capacity: 8,
  });

  it('compileArchitectureBlock extracts room properties', () => {
    const ir = compileArchitectureBlock(roomBlock);
    expect(ir.name).toBe('LivingRoom');
    expect(ir.keyword).toBe('room');
    expect(ir.area).toBe(35.5);
    expect(ir.height).toBe(3.0);
    expect(ir.wallMaterial).toBe('concrete');
    expect(ir.floorMaterial).toBe('hardwood');
    expect(ir.temperatureSetpoint).toBe(22);
    expect(ir.capacity).toBe(8);
  });

  it('compileArchitectureBlock extracts building code', () => {
    const block = makeBlock('architecture', 'building', 'Office', {
      building_code: 'IBC-2021',
    });
    const ir = compileArchitectureBlock(block);
    expect(ir.buildingCode).toBe('IBC-2021');
  });

  it('architectureToR3F generates config', () => {
    const code = architectureToR3F(compileArchitectureBlock(roomBlock));
    expect(code).toContain('LivingRoomConfig');
    expect(code).toContain('area: 35.5');
    expect(code).toContain('wallMaterial: "concrete"');
  });

  it('architectureToUnity generates C# class', () => {
    const code = architectureToUnity(compileArchitectureBlock(roomBlock));
    expect(code).toContain('class LivingRoomArchitecture : MonoBehaviour');
    expect(code).toContain('area = 35.5f');
    expect(code).toContain('capacity = 8');
  });

  it('architectureToGodot generates GDScript', () => {
    const code = architectureToGodot(compileArchitectureBlock(roomBlock));
    expect(code).toContain('extends Node3D');
    expect(code).toContain('area: float = 35.5');
    expect(code).toContain('signal temperature_changed');
  });

  it('architectureToVRChat generates UdonSharp', () => {
    const code = architectureToVRChat(compileArchitectureBlock(roomBlock));
    expect(code).toContain('class LivingRoomArchitecture');
    expect(code).toContain('capacity = 8');
  });

  it('architectureToUSDA generates USD annotations', () => {
    const code = architectureToUSDA(compileArchitectureBlock(roomBlock));
    expect(code).toContain('def Scope "Architecture_LivingRoom"');
    expect(code).toContain('holoscript:area = 35.5');
    expect(code).toContain('holoscript:wallMaterial = "concrete"');
  });
});

// =============================================================================
// Web3 Domain
// =============================================================================

describe('Web3 Domain', () => {
  const contractBlock = makeBlock('web3', 'contract', 'NFTCollection', {
    standard: 'ERC721',
    network: 'base',
    contract_address: '0xABC123',
    functions: ['mint', 'transfer', 'burn'],
  });

  it('compileWeb3Block extracts contract properties', () => {
    const ir = compileWeb3Block(contractBlock);
    expect(ir.name).toBe('NFTCollection');
    expect(ir.standard).toBe('ERC721');
    expect(ir.network).toBe('base');
    expect(ir.contractAddress).toBe('0xABC123');
    expect(ir.functions).toEqual(['mint', 'transfer', 'burn']);
  });

  it('compileWeb3Block extracts token supply', () => {
    const block = makeBlock('web3', 'token', 'GameCoin', {
      standard: 'ERC20',
      total_supply: 1000000,
    });
    const ir = compileWeb3Block(block);
    expect(ir.supply).toBe(1000000);
  });

  it('compileWeb3Block extracts functions from children', () => {
    const block = makeBlock('web3', 'contract', 'DAO', {}, [
      { keyword: 'function', name: 'propose', properties: {} },
      { keyword: 'function', name: 'vote', properties: {} },
    ]);
    const ir = compileWeb3Block(block);
    expect(ir.functions).toEqual(['propose', 'vote']);
  });

  it('web3ToR3F generates config', () => {
    const code = web3ToR3F(compileWeb3Block(contractBlock));
    expect(code).toContain('NFTCollectionConfig');
    expect(code).toContain('"ERC721"');
    expect(code).toContain('"base"');
    expect(code).toContain('contractAddress');
  });

  it('web3ToUnity generates C# class', () => {
    const code = web3ToUnity(compileWeb3Block(contractBlock));
    expect(code).toContain('class NFTCollectionWeb3 : MonoBehaviour');
    expect(code).toContain('standard = "ERC721"');
    expect(code).toContain('contractAddress = "0xABC123"');
  });

  it('web3ToGodot generates GDScript', () => {
    const code = web3ToGodot(compileWeb3Block(contractBlock));
    expect(code).toContain('extends Node');
    expect(code).toContain('standard: String = "ERC721"');
    expect(code).toContain('signal transaction_confirmed');
    expect(code).toContain('signal wallet_connected');
  });

  it('web3ToVRChat generates UdonSharp', () => {
    const code = web3ToVRChat(compileWeb3Block(contractBlock));
    expect(code).toContain('class NFTCollectionWeb3');
    expect(code).toContain('[UdonSynced] public string walletState');
  });

  it('web3ToUSDA generates USD annotations', () => {
    const code = web3ToUSDA(compileWeb3Block(contractBlock));
    expect(code).toContain('def Scope "Web3_NFTCollection"');
    expect(code).toContain('holoscript:standard = "ERC721"');
    expect(code).toContain('holoscript:contractAddress = "0xABC123"');
  });
});

// =============================================================================
// Procedural Domain
// =============================================================================

describe('Procedural Domain', () => {
  const scatterBlock = makeBlock('procedural', 'scatter', 'TreeForest', {
    seed: 42,
    density: 0.8,
    scale_range: [0.5, 2.0],
    source_mesh: 'tree_oak.glb',
    noise_type: 'simplex',
    octaves: 6,
    frequency: 0.5,
    amplitude: 2.0,
  });

  it('compileProceduralBlock extracts scatter properties', () => {
    const ir = compileProceduralBlock(scatterBlock);
    expect(ir.name).toBe('TreeForest');
    expect(ir.seed).toBe(42);
    expect(ir.density).toBe(0.8);
    expect(ir.scaleRange).toEqual([0.5, 2.0]);
    expect(ir.sourceMesh).toBe('tree_oak.glb');
    expect(ir.noise).toEqual({ type: 'simplex', octaves: 6, frequency: 0.5, amplitude: 2.0 });
  });

  it('compileProceduralBlock extracts noise from nested object', () => {
    const block = makeBlock('procedural', 'generate', 'Terrain', {
      noise: { type: 'perlin', octaves: 8, frequency: 1.0, amplitude: 5.0 },
    });
    const ir = compileProceduralBlock(block);
    expect(ir.noise!.type).toBe('perlin');
    expect(ir.noise!.octaves).toBe(8);
  });

  it('compileProceduralBlock defaults for empty', () => {
    const block = makeBlock('procedural', 'distribute', 'Points', {});
    const ir = compileProceduralBlock(block);
    expect(ir.genType).toBe('distribute');
    expect(ir.seed).toBeUndefined();
    expect(ir.noise).toBeUndefined();
  });

  it('proceduralToR3F generates config', () => {
    const code = proceduralToR3F(compileProceduralBlock(scatterBlock));
    expect(code).toContain('TreeForestConfig');
    expect(code).toContain('seed: 42');
    expect(code).toContain('density: 0.8');
    expect(code).toContain('scaleRange: [0.5, 2]');
  });

  it('proceduralToUnity generates C# class', () => {
    const code = proceduralToUnity(compileProceduralBlock(scatterBlock));
    expect(code).toContain('class TreeForestProcedural : MonoBehaviour');
    expect(code).toContain('seed = 42');
    expect(code).toContain('density = 0.8f');
    expect(code).toContain('octaves = 6');
  });

  it('proceduralToGodot generates GDScript', () => {
    const code = proceduralToGodot(compileProceduralBlock(scatterBlock));
    expect(code).toContain('extends Node3D');
    expect(code).toContain('seed: int = 42');
    expect(code).toContain('signal generation_complete');
  });

  it('proceduralToVRChat generates UdonSharp', () => {
    const code = proceduralToVRChat(compileProceduralBlock(scatterBlock));
    expect(code).toContain('class TreeForestProcedural');
    expect(code).toContain('[UdonSynced] public int seed = 42');
  });

  it('proceduralToUSDA generates USD annotations', () => {
    const code = proceduralToUSDA(compileProceduralBlock(scatterBlock));
    expect(code).toContain('def Scope "Procedural_TreeForest"');
    expect(code).toContain('holoscript:seed = 42');
    expect(code).toContain('holoscript:density = 0.8');
  });
});

// =============================================================================
// Rendering Domain
// =============================================================================

describe('Rendering Domain', () => {
  const lodBlock = makeBlock(
    'rendering',
    'lod',
    'CharacterLOD',
    {
      shadow_mode: 'both',
      culling_mode: 'frustum',
      sort_order: 5,
    },
    [
      { keyword: 'level', name: 'high', properties: { distance: 10, detail: 1.0 } },
      { keyword: 'level', name: 'medium', properties: { distance: 30, detail: 0.5 } },
      { keyword: 'level', name: 'low', properties: { distance: 80, detail: 0.1 } },
    ]
  );

  it('compileRenderingBlock extracts LOD levels from children', () => {
    const ir = compileRenderingBlock(lodBlock);
    expect(ir.name).toBe('CharacterLOD');
    expect(ir.lodLevels).toHaveLength(3);
    expect(ir.lodLevels![0]).toEqual({ distance: 10, mesh: 'high', detail: 1.0 });
    expect(ir.lodLevels![2]).toEqual({ distance: 80, mesh: 'low', detail: 0.1 });
    expect(ir.shadowMode).toBe('both');
    expect(ir.cullingMode).toBe('frustum');
    expect(ir.sortOrder).toBe(5);
  });

  it('compileRenderingBlock extracts render layer', () => {
    const block = makeBlock('rendering', 'render', 'UI', {
      render_layer: 'overlay',
    });
    const ir = compileRenderingBlock(block);
    expect(ir.renderLayer).toBe('overlay');
  });

  it('renderingToR3F generates config', () => {
    const code = renderingToR3F(compileRenderingBlock(lodBlock));
    expect(code).toContain('CharacterLODConfig');
    expect(code).toContain('lodLevels');
    expect(code).toContain('shadowMode: "both"');
    expect(code).toContain('sortOrder: 5');
  });

  it('renderingToUnity generates C# with LODGroup', () => {
    const code = renderingToUnity(compileRenderingBlock(lodBlock));
    expect(code).toContain('class CharacterLODRendering : MonoBehaviour');
    expect(code).toContain('LODGroup');
    expect(code).toContain('new LOD[3]');
  });

  it('renderingToGodot generates GDScript', () => {
    const code = renderingToGodot(compileRenderingBlock(lodBlock));
    expect(code).toContain('extends Node3D');
    expect(code).toContain('shadow_mode: String = "both"');
    expect(code).toContain('lod0_distance');
    expect(code).toContain('lod2_distance');
  });

  it('renderingToVRChat generates UdonSharp', () => {
    const code = renderingToVRChat(compileRenderingBlock(lodBlock));
    expect(code).toContain('class CharacterLODRendering');
    expect(code).toContain('lodLevels = 3');
  });

  it('renderingToUSDA generates USD annotations', () => {
    const code = renderingToUSDA(compileRenderingBlock(lodBlock));
    expect(code).toContain('def Scope "Rendering_CharacterLOD"');
    expect(code).toContain('holoscript:shadowMode = "both"');
    expect(code).toContain('holoscript:lodLevels = 3');
  });
});

// =============================================================================
// Navigation Domain
// =============================================================================

describe('Navigation Domain', () => {
  const navmeshBlock = makeBlock('navigation', 'navmesh', 'WorldNavMesh', {
    agent_radius: 0.5,
    agent_height: 2.0,
    max_slope: 45,
    step_height: 0.3,
  });

  const agentBlock = makeBlock('navigation', 'nav_agent', 'EnemyAgent', {
    speed: 5.0,
    agent_radius: 0.4,
    agent_height: 1.8,
    avoidance_priority: 50,
    behavior_root: 'patrol',
  });

  it('compileNavigationBlock extracts navmesh properties', () => {
    const ir = compileNavigationBlock(navmeshBlock);
    expect(ir.name).toBe('WorldNavMesh');
    expect(ir.agentRadius).toBe(0.5);
    expect(ir.agentHeight).toBe(2.0);
    expect(ir.maxSlope).toBe(45);
    expect(ir.stepHeight).toBe(0.3);
  });

  it('compileNavigationBlock extracts agent properties', () => {
    const ir = compileNavigationBlock(agentBlock);
    expect(ir.speed).toBe(5.0);
    expect(ir.avoidancePriority).toBe(50);
    expect(ir.behaviorRoot).toBe('patrol');
  });

  it('navigationToR3F generates config', () => {
    const code = navigationToR3F(compileNavigationBlock(agentBlock));
    expect(code).toContain('EnemyAgentConfig');
    expect(code).toContain('speed: 5');
    expect(code).toContain('behaviorRoot: "patrol"');
  });

  it('navigationToUnity generates NavMeshAgent setup', () => {
    const code = navigationToUnity(compileNavigationBlock(agentBlock));
    expect(code).toContain('class EnemyAgentNavigation : MonoBehaviour');
    expect(code).toContain('NavMeshAgent');
    expect(code).toContain('agent.speed = 5f');
    expect(code).toContain('agent.radius = 0.4f');
  });

  it('navigationToUnity generates NavMeshSurface for navmesh keyword', () => {
    const code = navigationToUnity(compileNavigationBlock(navmeshBlock));
    expect(code).toContain('NavMeshSurface');
  });

  it('navigationToGodot generates NavigationAgent3D for agents', () => {
    const code = navigationToGodot(compileNavigationBlock(agentBlock));
    expect(code).toContain('extends NavigationAgent3D');
    expect(code).toContain('speed: float = 5');
    expect(code).toContain('signal navigation_finished');
  });

  it('navigationToGodot generates NavigationRegion3D for navmesh', () => {
    const code = navigationToGodot(compileNavigationBlock(navmeshBlock));
    expect(code).toContain('extends NavigationRegion3D');
    expect(code).toContain('max_slope: float = 45');
  });

  it('navigationToVRChat generates UdonSharp', () => {
    const code = navigationToVRChat(compileNavigationBlock(agentBlock));
    expect(code).toContain('class EnemyAgentNavigation');
    expect(code).toContain('speed = 5f');
  });

  it('navigationToUSDA generates USD annotations', () => {
    const code = navigationToUSDA(compileNavigationBlock(navmeshBlock));
    expect(code).toContain('def Scope "Navigation_WorldNavMesh"');
    expect(code).toContain('holoscript:agentRadius = 0.5');
    expect(code).toContain('holoscript:maxSlope = 45');
  });
});

// =============================================================================
// Input Domain
// =============================================================================

describe('Input Domain', () => {
  const interactionBlock = makeBlock('input', 'interaction', 'GrabAction', {
    input_type: 'gesture',
    platform: 'vr_controller',
    binding: 'grip',
    action: 'grab',
    threshold: 0.8,
    interaction_distance: 2.0,
  });

  it('compileInputBlock extracts interaction properties', () => {
    const ir = compileInputBlock(interactionBlock);
    expect(ir.name).toBe('GrabAction');
    expect(ir.inputType).toBe('gesture');
    expect(ir.platform).toBe('vr_controller');
    expect(ir.binding).toBe('grip');
    expect(ir.action).toBe('grab');
    expect(ir.threshold).toBe(0.8);
    expect(ir.interactionDistance).toBe(2.0);
  });

  it('compileInputBlock uses keyword as fallback type', () => {
    const block = makeBlock('input', 'gesture_profile', 'Swipe', {});
    const ir = compileInputBlock(block);
    expect(ir.inputType).toBe('gesture_profile');
  });

  it('inputToR3F generates config', () => {
    const code = inputToR3F(compileInputBlock(interactionBlock));
    expect(code).toContain('GrabActionConfig');
    expect(code).toContain('"gesture"');
    expect(code).toContain('binding: "grip"');
    expect(code).toContain('action: "grab"');
    expect(code).toContain('threshold: 0.8');
  });

  it('inputToUnity generates C# with XR input for VR', () => {
    const code = inputToUnity(compileInputBlock(interactionBlock));
    expect(code).toContain('class GrabActionInput : MonoBehaviour');
    expect(code).toContain('XRNode');
    expect(code).toContain('interactionDistance = 2f');
  });

  it('inputToGodot generates GDScript', () => {
    const code = inputToGodot(compileInputBlock(interactionBlock));
    expect(code).toContain('extends Node');
    expect(code).toContain('binding: String = "grip"');
    expect(code).toContain('signal action_triggered');
    expect(code).toContain('signal gesture_recognized');
  });

  it('inputToVRChat generates UdonSharp with Interact', () => {
    const code = inputToVRChat(compileInputBlock(interactionBlock));
    expect(code).toContain('class GrabActionInput');
    expect(code).toContain('override void Interact');
    expect(code).toContain('interactionDistance = 2f');
  });

  it('inputToUSDA generates USD annotations', () => {
    const code = inputToUSDA(compileInputBlock(interactionBlock));
    expect(code).toContain('def Scope "Input_GrabAction"');
    expect(code).toContain('holoscript:binding = "grip"');
    expect(code).toContain('holoscript:action = "grab"');
    expect(code).toContain('holoscript:interactionDistance = 2');
  });
});
