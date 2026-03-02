/**
 * Tests for v4.0/v4.2 HoloCompositionParser features
 *
 * Covers:
 * - Domain blocks (IoT, robotics, dataviz, healthcare, web3, music, education, architecture)
 * - Simulation layer (material, particle, weather, physics, postfx, navigation)
 * - Spatial primitives (spawn_group, waypoints, constraint, terrain)
 * - Keyword tokenization for 127+ new keywords
 */

import { describe, it, expect } from 'vitest';
import { parseHolo } from './HoloCompositionParser';

// =============================================================================
// DOMAIN BLOCKS (v4.0)
// =============================================================================

describe('v4.0 Domain Blocks', () => {
  it('parses IoT sensor block with properties', () => {
    const source = `
      sensor "TempSensor_01" {
        type: "DHT22"
        protocol: "mqtt"
        interval_ms: 5000
        topic: "factory/zone_a/temp"
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks).toBeDefined();
    expect(result.ast!.domainBlocks!.length).toBeGreaterThanOrEqual(1);
    const block = result.ast!.domainBlocks![0];
    expect(block.type).toBe('DomainBlock');
    expect(block.domain).toBe('iot');
    expect(block.name).toBe('TempSensor_01');
    expect(block.properties['type']).toBe('DHT22');
    expect(block.properties['protocol']).toBe('mqtt');
    expect(block.properties['interval_ms']).toBe(5000);
  });

  it('parses robotics joint block', () => {
    const source = `
      joint "Shoulder" {
        type: "revolute"
        axis: [0, 0, 1]
        limits: [-90, 90]
        max_torque: 100
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks).toBeDefined();
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('robotics');
    expect(block.keyword).toBe('joint');
    expect(block.name).toBe('Shoulder');
    expect(block.properties['type']).toBe('revolute');
  });

  it('parses dataviz dashboard block', () => {
    const source = `
      dashboard "FactoryMetrics" {
        refresh_rate: 1000
        layout: "grid"
        columns: 3
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('dataviz');
    expect(block.name).toBe('FactoryMetrics');
  });

  it('parses healthcare procedure block', () => {
    const source = `
      procedure "CPR_Training" {
        difficulty: "intermediate"
        certification: "AHA"
        time_limit: 120
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('healthcare');
    expect(block.name).toBe('CPR_Training');
    expect(block.properties['certification']).toBe('AHA');
  });

  it('parses web3 contract block', () => {
    const source = `
      contract "GameToken" {
        chain: "base"
        royalty_bps: 500
        max_supply: 10000
        standard: "erc721"
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('web3');
    expect(block.name).toBe('GameToken');
    expect(block.properties['chain']).toBe('base');
    expect(block.properties['standard']).toBe('erc721');
  });

  it('parses music instrument block', () => {
    const source = `
      instrument "Synth_01" {
        type: "subtractive"
        oscillator: "sawtooth"
        filter_cutoff: 2000
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('music');
  });

  it('parses education lesson block', () => {
    const source = `
      lesson "Intro_Physics" {
        subject: "physics"
        grade_level: 9
        duration_min: 45
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('education');
    expect(block.name).toBe('Intro_Physics');
  });

  it('parses architecture floor_plan block', () => {
    const source = `
      floor_plan "Level1" {
        scale: 0.01
        units: "meters"
        width: 30
        depth: 20
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('architecture');
    expect(block.name).toBe('Level1');
  });
});

// =============================================================================
// SIMULATION LAYER (v4.2)
// =============================================================================

describe('v4.2 Simulation Layer', () => {
  it('parses material block with PBR properties', () => {
    const source = `
      material "Steel" {
        albedo: [0.5, 0.5, 0.55]
        metallic: 0.9
        roughness: 0.3
        normal_map: "textures/steel_normal.png"
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('material');
    expect(block.keyword).toBe('material');
    expect(block.name).toBe('Steel');
    expect(block.properties['metallic']).toBe(0.9);
  });

  it('parses rigidbody block', () => {
    const source = `
      rigidbody "CrateDynamic" {
        mass: 25
        drag: 0.1
        angular_drag: 0.05
        gravity: true
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('physics');
    expect(block.properties['mass']).toBe(25);
  });

  it('parses particle emitter block', () => {
    const source = `
      emitter "FireVFX" {
        rate: 500
        lifetime: 2.5
        shape: "cone"
        color_start: [1, 0.5, 0]
        color_end: [1, 0, 0]
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('vfx');
    expect(block.properties['rate']).toBe(500);
  });

  it('parses weather block', () => {
    const source = `
      weather "Rainstorm" {
        type: "rain"
        intensity: 0.8
        wind_speed: 15
        fog_density: 0.3
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('weather');
    expect(block.name).toBe('Rainstorm');
  });

  it('parses navmesh block', () => {
    const source = `
      navmesh "WorldNav" {
        agent_radius: 0.5
        agent_height: 2.0
        max_slope: 45
        step_height: 0.4
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('navigation');
  });

  it('parses post_processing block', () => {
    const source = `
      post_processing "Cinematic" {
        bloom_intensity: 1.5
        color_grading: "warm"
        vignette: 0.3
        ambient_occlusion: true
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('postfx');
    expect(block.name).toBe('Cinematic');
  });
});

// =============================================================================
// SPATIAL PRIMITIVES (v4.0)
// =============================================================================

describe('v4.0 Spatial Primitives', () => {
  it('parses spawn_group with properties', () => {
    const source = `
      spawn_group "Enemies" {
        count: 10
        radius: 50
        template: "Goblin"
        min_distance: 5
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.spawnGroups).toBeDefined();
    expect(result.ast!.spawnGroups!.length).toBe(1);
    const sg = result.ast!.spawnGroups![0];
    expect(sg.type).toBe('SpawnGroup');
    expect(sg.name).toBe('Enemies');
    expect(sg.properties['count']).toBe(10);
    expect(sg.properties['radius']).toBe(50);
  });

  it('parses waypoints with point array', () => {
    const source = `
      waypoints "PatrolRoute" [[0,0,0], [10,0,0], [10,0,10], [0,0,10]]
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.waypointSets).toBeDefined();
    expect(result.ast!.waypointSets!.length).toBe(1);
    const wp = result.ast!.waypointSets![0];
    expect(wp.type).toBe('Waypoints');
    expect(wp.name).toBe('PatrolRoute');
    expect(wp.points).toBeDefined();
  });

  it('parses constraint block', () => {
    const source = `
      constraint LookAt {
        source: "Camera"
        target: "Player"
        axis: "y"
        damping: 0.1
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.constraints).toBeDefined();
    expect(result.ast!.constraints!.length).toBe(1);
    const c = result.ast!.constraints![0];
    expect(c.type).toBe('Constraint');
    expect(c.name).toBe('LookAt');
    expect(c.properties['source']).toBe('Camera');
    expect(c.properties['target']).toBe('Player');
  });

  it('parses terrain block', () => {
    const source = `
      terrain Mountains {
        heightmap: "terrain/mountains_hm.png"
        size: [1000, 200, 1000]
        resolution: 256
        texture_splat: "terrain/splat.png"
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.terrains).toBeDefined();
    expect(result.ast!.terrains!.length).toBe(1);
    const t = result.ast!.terrains![0];
    expect(t.type).toBe('Terrain');
    expect(t.name).toBe('Mountains');
    expect(t.properties['heightmap']).toBe('terrain/mountains_hm.png');
    expect(t.properties['resolution']).toBe(256);
  });
});

// =============================================================================
// INTEGRATION
// =============================================================================

describe('v4 Integration', () => {
  it('parses multiple domain blocks + spatial primitives together', () => {
    const source = `
      sensor "Temp" {
        type: "DHT22"
        interval_ms: 1000
      }

      material "Floor" {
        metallic: 0.0
        roughness: 0.8
      }

      spawn_group "NPCs" {
        count: 5
        radius: 20
      }

      terrain World {
        heightmap: "map.png"
        size: [500, 100, 500]
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks!.length).toBe(2);
    expect(result.ast?.domainBlocks![0].domain).toBe('iot');
    expect(result.ast?.domainBlocks![1].domain).toBe('material');
    expect(result.ast?.spawnGroups!.length).toBe(1);
    expect(result.ast?.terrains!.length).toBe(1);
  });

  it('parses domain block with event handler', () => {
    const source = `
      sensor "PresenceSensor" {
        type: "PIR"
        range: 10
        onDetect(entity) {
          alert("motion detected")
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const block = result.ast!.domainBlocks![0];
    expect(block.domain).toBe('iot');
    expect(block.eventHandlers).toBeDefined();
    expect(block.eventHandlers!.length).toBeGreaterThanOrEqual(1);
    expect(block.eventHandlers![0].event).toBe('onDetect');
  });
});

// =============================================================================
// FIX 1: parseComposition() v4 dispatch (was missing, only implicit mode worked)
// =============================================================================

describe('Fix: composition mode v4 dispatch', () => {
  it('parses domain blocks inside composition { }', () => {
    const source = `
      composition "Factory" {
        sensor "TempSensor" {
          type: "DHT22"
          interval_ms: 5000
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.name).toBe('Factory');
    expect(result.ast?.domainBlocks).toBeDefined();
    expect(result.ast!.domainBlocks!.length).toBe(1);
    expect(result.ast!.domainBlocks![0].domain).toBe('iot');
  });

  it('parses spatial primitives inside composition { }', () => {
    const source = `
      composition "World" {
        spawn_group "Enemies" {
          count: 10
          radius: 50
        }

        terrain MainMap {
          heightmap: "map.png"
          resolution: 512
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.spawnGroups!.length).toBe(1);
    expect(result.ast!.spawnGroups![0].name).toBe('Enemies');
    expect(result.ast?.terrains!.length).toBe(1);
    expect(result.ast!.terrains![0].name).toBe('MainMap');
  });

  it('parses simulation blocks inside composition { }', () => {
    const source = `
      composition "Scene" {
        material "Gold" {
          metallic: 1.0
          roughness: 0.2
        }

        weather "Storm" {
          type: "thunderstorm"
          intensity: 0.9
        }

        navmesh "Level" {
          agent_radius: 0.5
          max_slope: 45
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks!.length).toBe(3);
    expect(result.ast!.domainBlocks![0].domain).toBe('material');
    expect(result.ast!.domainBlocks![1].domain).toBe('weather');
    expect(result.ast!.domainBlocks![2].domain).toBe('navigation');
  });

  it('mixes v3 and v4 blocks in standard composition', () => {
    const source = `
      composition "RPG" {
        environment {
          theme: "dungeon"
          skybox: "cave"
        }

        object "Player" {
          position: [0, 1.6, 0]
          health: 100
        }

        rigidbody "Crate" {
          mass: 50
          gravity: true
        }

        spawn_group "Goblins" {
          count: 5
          radius: 25
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.environment).toBeDefined();
    expect(result.ast?.objects.length).toBe(1);
    expect(result.ast?.domainBlocks!.length).toBe(1);
    expect(result.ast?.spawnGroups!.length).toBe(1);
  });
});

// =============================================================================
// FIX 2: @state decorator support in implicit composition mode
// =============================================================================

describe('Fix: implicit mode @decorator handling', () => {
  it('parses @state in implicit composition', () => {
    const source = `
      @state {
        health: 100
        name: "Player"
      }

      sensor "Door" {
        type: "proximity"
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.state).toBeDefined();
    expect(result.ast?.state?.properties.length).toBeGreaterThanOrEqual(2);
    expect(result.ast?.domainBlocks!.length).toBe(1);
  });
});

