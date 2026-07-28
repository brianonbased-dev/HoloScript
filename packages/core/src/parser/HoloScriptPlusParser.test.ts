import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';
import type { HoloBrainDecl } from './HoloScriptPlusParser';

describe('HoloScriptPlusParser - Extended Features', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('parses closing-brace EOF dedent the same as trailing newline', () => {
    const withoutTrailingNewline =
      'orb Sword @grabbable @throwable() {\n  geometry: "model/sword.glb"\n}';
    const withTrailingNewline = `${withoutTrailingNewline}\n`;

    const withoutResult = parser.parse(withoutTrailingNewline);
    const withResult = parser.parse(withTrailingNewline);

    expect(withoutResult.success).toBe(true);
    expect(withoutResult.errors).toEqual([]);
    expect(withResult.success).toBe(true);
    expect(withResult.errors).toEqual([]);
    expect(withoutResult.ast.root.directives).toEqual(withResult.ast.root.directives);
    expect(
      withoutResult.ast.root.directives.find((directive) => directive.name === 'throwable')
    ).toMatchObject({
      config: {},
    });
    expect(withoutResult.ast.root.properties).toEqual({ geometry: 'model/sword.glb' });
  });

  it('fails loudly when a pre-body trait block swallows object-body properties', () => {
    const base = 'orb Spirit @spatial_audio {\n  geometry: "sphere"\n}';

    for (const source of [base, `${base}\n`]) {
      const result = parser.parse(source);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'HSP101',
            message: expect.stringContaining('looks like an object body'),
          }),
        ])
      );
    }
  });

  it('Parses @networked trait correctly', () => {
    const source = `cube#networked_box @networked(sync_mode: "reliable", authority: "owner") { position: [1, 2, 3] }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const node = result.ast.root;
    expect(node.traits.has('networked')).toBe(true);
    const config = node.traits.get('networked');
    expect(config.sync_mode).toBe('reliable');
    expect(config.authority).toBe('owner');
  });

  it('Parses @external_api directive correctly', () => {
    const source = `object api_sensor @external_api(url: "https://api.iot.com/sensor", method: "GET", interval: "10s") {
      @on_data_update(data) => state.val = data.value
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    // Note: implementation might put body in directive logic
  });

  it('Handles multiple directives and traits', () => {
    const source = `light#living_room @networked(sync_mode: "state-only") @external_api(url: "https://api.home.com/light", interval: "5m") @grabbable() { color: "#ffffff" }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const node = result.ast.root;
    expect(node.traits.has('networked')).toBe(true);
    expect(node.traits.has('grabbable')).toBe(true);
    expect(node.properties.color).toBe('#ffffff');
  });

  it('parses trait-level additive sums as unresolved semiring alternatives', () => {
    const source = `object#candidate @regular_polygon_sheet(sides: 3) + @regular_polygon_sheet(sides: 4) { label: "discover" }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const node = result.ast.root;
    const sum = node.directives.find((directive) => directive.type === 'trait_sum');
    expect(sum).toMatchObject({
      type: 'trait_sum',
      operation: 'additive',
      alternatives: [
        { type: 'trait_atom', name: 'regular_polygon_sheet', config: { sides: 3 } },
        { type: 'trait_atom', name: 'regular_polygon_sheet', config: { sides: 4 } },
      ],
    });
    expect(node.traits.has('regular_polygon_sheet')).toBe(false);
  });

  it('Parses VFX particle subtype traits as first-class VR traits', () => {
    const source = `object#fx_ball @vfx_particle_sparks(color: "#ffaa22", intensity: 2) @vfx_particle_smoke(density: 0.7, drift: [0.1, 0.4, 0]) @vfx_particle_fire(count: 320, lifetime: 0.4) { position: [0, 1, 0] }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const node = result.ast.root;
    expect(node.traits.has('vfx_particle_sparks')).toBe(true);
    expect(node.traits.get('vfx_particle_sparks')?.intensity).toBe(2);
    expect(node.traits.has('vfx_particle_smoke')).toBe(true);
    expect(node.traits.get('vfx_particle_smoke')?.density).toBe(0.7);
    expect(node.traits.has('vfx_particle_fire')).toBe(true);
    expect(node.traits.get('vfx_particle_fire')?.count).toBe(320);
  });

  it('Parses @gem_resonance as a first-class VR trait', () => {
    const source = `object#fire_gem @crystal_gem @enchantable(element: "fire") @gem_resonance(max_distance: 0.5, base_frequencies: "auto", blend_mode: "harmonic", output: "spatial_audio") { position: [0, 1, 0] }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const node = result.ast.root;
    expect(node.traits.has('gem_resonance')).toBe(true);
    expect(node.traits.get('gem_resonance')?.max_distance).toBe(0.5);
    expect(node.traits.get('gem_resonance')?.blend_mode).toBe('harmonic');
  });
});

describe('HoloScriptPlusParser - Control Flow', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses @while loop correctly', () => {
    const source = `scene#main {
      @while count < 10 {
        orb#item { size: 1 }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  it('Parses @forEach loop correctly', () => {
    const source = `scene#main {
      @forEach item in items {
        orb#item { size: 1 }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const forEach = result.ast.root.directives.find(
      (directive) => directive.type === 'forEach'
    ) as any;
    expect(forEach?.body).toHaveLength(1);
    expect(forEach.body[0]).toMatchObject({
      type: 'orb',
      id: 'item',
      properties: { size: 1 },
    });
  });

  it('Parses @for loop correctly', () => {
    const source = `scene#main {
      @for i in range(5) {
        orb#item { size: 1 }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });
});

describe('HoloScriptPlusParser - Import Statements', () => {
  it('Parses @import with path', () => {
    const parser = new HoloScriptPlusParser({
      enableVRTraits: true,
      enableTypeScriptImports: true,
    });
    const source = `@import "./utils/helpers.ts"
    scene#main { size: 1 }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.imports.length).toBe(1);
    expect(result.ast.imports[0].path).toBe('./utils/helpers.ts');
    expect(result.ast.imports[0].alias).toBe('helpers');
  });

  it('Parses @import with alias', () => {
    const parser = new HoloScriptPlusParser({
      enableVRTraits: true,
      enableTypeScriptImports: true,
    });
    const source = `@import "./utils/math-helpers.ts" as MathUtils
    scene#main { size: 1 }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.imports.length).toBe(1);
    expect(result.ast.imports[0].path).toBe('./utils/math-helpers.ts');
    expect(result.ast.imports[0].alias).toBe('MathUtils');
  });

  it('Parses multiple @import statements', () => {
    const parser = new HoloScriptPlusParser({
      enableVRTraits: true,
      enableTypeScriptImports: true,
    });
    const source = `@import "./utils.ts"
    @import "./helpers.ts" as H
    @import "./config.ts"
    scene#main { size: 1 }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.imports.length).toBe(3);
    expect(result.ast.imports[0].alias).toBe('utils');
    expect(result.ast.imports[1].alias).toBe('H');
    expect(result.ast.imports[2].alias).toBe('config');
  });
});

describe('HoloScriptPlusParser - Studio Surface Blocks', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('parses page and include as nested child nodes', () => {
    const source = `composition "Studio Shell" {
      object "Workspace" {
        page "Dashboard" {
          route: "/dashboard"
          title: "Dashboard"
        }

        include "SharedToolbar" {
          source: "./toolbar.holo"
        }
      }
    }`;

    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const workspace = result.ast.root.children?.find((child) => child.type === 'object');
    const page = workspace?.children?.find((child) => child.type === 'page');
    const include = workspace?.children?.find((child) => child.type === 'include');

    expect(page?.name).toBe('Dashboard');
    expect(page?.properties?.route).toBe('/dashboard');
    expect(include?.name).toBe('SharedToolbar');
    expect(include?.properties?.source).toBe('./toolbar.holo');
  });
});

describe('HoloScriptPlusParser - Logic Block', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses logic block with functions', () => {
    const source = `composition "Game" {
      logic {
        function take_damage(amount) {
          @state.health = @state.health - amount
        }
      }
      object "Player" { position: [0, 0, 0] }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const logicNode = result.ast.root.children?.find((c: any) => c.type === 'logic');
    expect(logicNode).toBeDefined();
    expect(logicNode.body.functions.length).toBeGreaterThan(0);
  });

  it('Parses logic block with HoloShell-style actions', () => {
    const source = `composition "HoloShell Shell World" {
      logic {
        on_enter {
          emit "holoshell_world_loaded"
        }

        action focus_shell_object(objectId) {
          state.activeShellObject = objectId
          emit "shell_object_focused"
        }

        action change_shell_skin(skinName) {
          state.activeSkin = skinName
          emit "shell_skin_changed"
        }
      }
    }`;

    const result = parser.parse(source);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    const logicNode = result.ast.root.children?.find((c: any) => c.type === 'logic') as any;
    expect(logicNode).toBeDefined();
    expect(logicNode.body.actions.map((action: any) => action.name)).toEqual([
      'focus_shell_object',
      'change_shell_skin',
    ]);
    expect(logicNode.body.actions[0].params).toEqual(['objectId']);
  });

  it('preserves raw action bodies instead of re-tokenizing compound operators', () => {
    const source = `composition "Game" {
      logic {
        action bump() {
          this.checkCount += 1
        }
      }
    }`;

    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const logicNode = result.ast.root.children?.find((child: any) => child.type === 'logic') as any;
    expect(logicNode.body.actions[0].body).toContain('this.checkCount += 1');
    expect(logicNode.body.actions[0].body).not.toContain('+ =');
  });
});

describe('HoloScriptPlusParser - Environment & Lighting', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses environment block', () => {
    const source = `composition "Scene" {
      environment {
        @skybox { type: "procedural" }
        @ambient_light { color: "#ffffff", intensity: 0.4 }
      }
      object "Floor" { geometry: "box" }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  it('does not warn for stress-test physics/lighting directives', () => {
    const source = `composition "StressScene" {
      @voronoi_fracture
      @granular_material
      @global_illumination
      @fluid_simulation
      object "Probe" { geometry: "cube" }
    }`;

    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const unknownWarnings = (result.warnings || []).filter((w: any) =>
      String(w.message || '').includes('Unknown directive')
    );

    expect(unknownWarnings).toHaveLength(0);

    const directiveNames = (result.ast.root.children?.[0]?.directives || [])
      .filter((d: any) => d?.type === 'trait')
      .map((d: any) => d.name);

    expect(directiveNames).toContain('voronoi_fracture');
    expect(directiveNames).toContain('granular_material');
    expect(directiveNames).toContain('global_illumination');
    expect(directiveNames).toContain('fluid_simulation');
  });

  it('parses artist-requested holographic mesh trait configs without unknown warnings', () => {
    const source = `composition "FashionDemo" {
      object "Mannequin" {
        @holographic_mesh {
          density: 0.8
          refraction: true
        }
      }
    }`;

    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const unknownWarnings = (result.warnings || []).filter((w: any) =>
      String(w.message || '').includes('Unknown directive')
    );
    expect(unknownWarnings).toHaveLength(0);

    const mannequin = result.ast.root.children?.[0];
    const trait = (mannequin?.directives || []).find((d: any) => d?.name === 'holographic_mesh');
    expect(trait).toBeDefined();
    expect((trait as any).config).toMatchObject({ density: 0.8, refraction: true });
  });
});

describe('HoloScriptPlusParser - AST Fidelity Guards', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('keeps sibling nodes distinct instead of dropping or leaking bodies', () => {
    const source = `composition "SiblingCheck" {
      orb One { geometry: "sphere" }
      orb Two { geometry: "box" }
      orb Three { geometry: "capsule" }
    }`;

    const result = parser.parse(source);

    expect(result.success).toBe(true);
    expect(result.ast.root.children?.map((child: any) => child.name)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
    expect(result.ast.root.children?.map((child: any) => child.properties.geometry)).toEqual([
      'sphere',
      'box',
      'capsule',
    ]);
  });
});

describe('HoloScriptPlusParser - Expression Parsing', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses string concatenation with +', () => {
    const source = `composition "Test" {
      greeting: "hello" + " world"
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.greeting).toEqual({
      type: 'binary',
      operator: '+',
      left: 'hello',
      right: ' world',
    });
  });

  it('Parses arithmetic with correct precedence (* before +)', () => {
    const source = `composition "Test" {
      result: 3 + 4 * 2
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.result).toEqual({
      type: 'binary',
      operator: '+',
      left: 3,
      right: { type: 'binary', operator: '*', left: 4, right: 2 },
    });
  });

  it('Parses $stateVar identifier with $ prefix', () => {
    const source = `composition "Test" {
      total: $counter + 1
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.total).toEqual({
      type: 'binary',
      operator: '+',
      left: { __ref: '$counter' },
      right: 1,
    });
  });

  it('Parses method call on $stateVar', () => {
    const source = `composition "Test" {
      label: $cost.toFixed(2)
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.label).toEqual({
      type: 'call',
      callee: '$cost.toFixed',
      args: 2,
    });
  });

  it('Parses ternary with comparison', () => {
    const source = `composition "Test" {
      color: $score > 70 ? "green" : "red"
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.color).toEqual({
      type: 'ternary',
      condition: {
        type: 'binary',
        operator: '>',
        left: { __ref: '$score' },
        right: 70,
      },
      trueValue: 'green',
      falseValue: 'red',
    });
  });

  it('Parses compound expression: string + method call', () => {
    const source = `composition "Test" {
      label: "$" + $cost.toFixed(2)
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.label).toEqual({
      type: 'binary',
      operator: '+',
      left: '$',
      right: { type: 'call', callee: '$cost.toFixed', args: 2 },
    });
  });

  it('Parses division and modulo', () => {
    const source = `composition "Test" {
      half: $total / 2
      remainder: $count % 3
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.half).toEqual({
      type: 'binary',
      operator: '/',
      left: { __ref: '$total' },
      right: 2,
    });
    expect(props.remainder).toEqual({
      type: 'binary',
      operator: '%',
      left: { __ref: '$count' },
      right: 3,
    });
  });

  it('Parses unary minus in expression', () => {
    const source = `composition "Test" {
      neg: -3 + 5
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    // -3 is folded into the number literal, then + 5
    expect(props.neg).toEqual({
      type: 'binary',
      operator: '+',
      left: -3,
      right: 5,
    });
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';

describe('HoloScriptPlusParser - Agent Behavior Examples', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });
  const repoRoot = join(__dirname, '../../../..'); // From packages/core/src/parser up to root

  const examples = [
    'examples/hsplus/agents/moderator-agent.hsplus',
    'examples/hsplus/agents/planner-agent.hsplus',
    'examples/hsplus/agents/researcher-agent.hsplus',
    'examples/hsplus/agents/watcher-agent.hsplus',
    'examples/hsplus/multi-agent/planner-executor-reviewer.hsplus',
    'examples/hsplus/multi-agent/swarm-consensus.hsplus',
    'examples/hsplus/governance/norm-enforcer.hsplus',
  ];

  for (const examplePath of examples) {
    it(`Parses ${examplePath} successfully`, () => {
      const fullPath = join(repoRoot, examplePath);
      const sourceCode = readFileSync(fullPath, 'utf-8');

      const result = parser.parse(sourceCode);

      if (!result.success) {
        console.error(`Parse failed for ${examplePath}: ${JSON.stringify(result.errors, null, 2)}`);
      }

      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
    });
  }
});

// =============================================================================
// Brain Declaration Tests
// =============================================================================

describe('HoloScriptPlusParser - Brain Declarations', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('parses a minimal brain declaration', () => {
    const source = `brain GoblinAI : @behavior_tree {
  @personality aggressive
  @memory_persistence true
  state idle {
    transition to patrol @when { hp > 0.5 }
  }
  state combat {
    transition to idle @when { hp < 0.1 }
  }
}`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    // The brain node is the root child
    const brain = result.ast.root as unknown as HoloBrainDecl;
    expect(brain.type).toBe('brain');
    expect(brain.name).toBe('GoblinAI');
    expect(brain.brainType).toBe('behavior_tree');
    expect(brain.personality).toBe('aggressive');
    expect(brain.memoryPersistence).toBe(true);
    expect(brain.states).toHaveLength(2);
    expect(brain.states[0].name).toBe('idle');
    expect(brain.states[0].transitions[0].to).toBe('patrol');
    expect(brain.states[1].name).toBe('combat');
  });

  it('parses @flee_threshold and @patrol_speed inside a brain', () => {
    const source = `brain WolfPack : @behavior_tree {
  @flee_threshold 0.15
  @patrol_speed 3.5
  @faction_alignment chaotic_neutral
  state patrol {
  }
}`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const brain = result.ast.root as unknown as HoloBrainDecl;
    expect(brain.fleeThreshold).toBeCloseTo(0.15);
    expect(brain.patrolSpeed).toBeCloseTo(3.5);
    expect(brain.factionAlignment).toBe('chaotic_neutral');
  });

  it('parses @preferred_ability inside a brain', () => {
    const source = `brain MageAI : @behavior_tree {
  @preferred_ability "FireBlast" @when { mana > 30 }
  state idle {
  }
}`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const brain = result.ast.root as unknown as HoloBrainDecl;
    expect(brain.preferredAbility?.name).toBe('FireBlast');
    expect(brain.preferredAbility?.when).toBeDefined();
  });

  it('parses MMO trait directives on npc nodes', () => {
    const source = `npc#merchant_alva {
  @quest {
    gives: [the_lost_shipment, alva_side_errand]
    completes: [the_lost_shipment]
    quest_marker: exclamation
  }
  @faction {
    faction_id: ironveil_guard
    hostile_factions: [goblin_clan]
  }
  @loot {
    table: merchant_drops
    instanced: true
    drop_on: death
  }
}`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const node = result.ast.root;
    const questDir = node.directives.find((d) => d.type === 'quest');
    expect(questDir).toBeDefined();
    const factionDir = node.directives.find((d) => d.type === 'faction');
    expect(factionDir).toBeDefined();
    const lootDir = node.directives.find((d) => d.type === 'loot');
    expect(lootDir).toBeDefined();
  });

  it('parses @authority directive with model property', () => {
    const source = `npc#village_elder {
  @authority {
    model: server_authoritative
    sync_rate: 10hz
    interpolation: true
  }
}`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const node = result.ast.root;
    const authorityDir = node.directives.find((d) => d.type === 'authority');
    expect(authorityDir).toBeDefined();
  });

  it('parses @world_chunk directive', () => {
    const source = `object#warehouse_building {
  @world_chunk {
    chunk_id: dockside
    streaming_priority: high
    cull_when_inactive: true
  }
}`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const node = result.ast.root;
    const chunkDir = node.directives.find((d) => d.type === 'world_chunk');
    expect(chunkDir).toBeDefined();
  });
});

// =============================================================================
// Behavioral layer — movements (@locomotion) & reactions (react block)
// =============================================================================

describe('HoloScriptPlusParser - Behavioral Layer', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('recognizes @locomotion as a typed trait (no unknown-directive warning)', () => {
    const source = `object#player @locomotion(mode: "glide", speed: 3.5, snap_turn: 45, teleport: true) { position: [0, 0, 0] }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const unknownWarnings = (result.warnings || []).filter((w: any) =>
      String(w.message || '').includes('Unknown')
    );
    expect(unknownWarnings).toHaveLength(0);

    const node = result.ast.root;
    expect(node.traits.has('locomotion')).toBe(true);
    expect(node.traits.get('locomotion')?.mode).toBe('glide');
    expect(node.traits.get('locomotion')?.speed).toBe(3.5);
  });

  it('parses a react block into categorized reaction children', () => {
    const source = `object#door {
      react {
        on_grab(hand) => highlight()
        on_proximity(player) => alert(player)
        on_teleport => warp_fx()
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const reactBlock = result.ast.root.children?.find((c: any) => c.type === 'react-block') as any;
    expect(reactBlock).toBeDefined();
    expect(reactBlock.children.length).toBe(3);

    const grab = reactBlock.children[0];
    expect(grab.type).toBe('reaction');
    expect(grab.name).toBe('on_grab');
    expect(grab.properties.params).toEqual(['hand']);
    expect(grab.properties.category).toBe('interaction');

    expect(reactBlock.children[1].properties.category).toBe('collision');
    expect(reactBlock.children[2].properties.category).toBe('movement');
  });

  it('supports a block body and an optional leading `on` word', () => {
    const source = `object#chest {
      react {
        on collide(other) => { open(); play("creak") }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const reactBlock = result.ast.root.children?.find((c: any) => c.type === 'react-block') as any;
    expect(reactBlock.children[0].name).toBe('on_collide');
    expect(reactBlock.children[0].properties.category).toBe('collision');
    expect(String(reactBlock.children[0].body)).toContain('open');
  });
});

describe('HoloScriptPlusParser - timeline keyframe tracks (Theatre.js harvest S1)', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  function timelineOf(source: string): any {
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const tl = (result.ast.root.children ?? []).find((c: any) => c.type === 'timeline');
    expect(tl, 'expected a timeline child node').toBeDefined();
    return tl;
  }

  it('parses the headline track grammar into structured keyframes', () => {
    // Parity target with the Rust grammar:
    //   timeline intro { track "scaleUniform" { key 0 {0}; key 1 {1} easing spring } }
    const tl = timelineOf(`composition Demo {
      timeline intro {
        track "scaleUniform" { key 0 {0}; key 1 {1} easing spring }
      }
    }`);

    expect(tl.name).toBe('intro');
    const tracks = tl.children.filter((c: any) => c.type === 'track');
    expect(tracks).toHaveLength(1);

    const track = tracks[0];
    expect(track.target).toBe('scaleUniform');
    expect(track.keyframes).toHaveLength(2);

    expect(track.keyframes[0]).toMatchObject({ time: 0, value: 0 });
    expect(track.keyframes[0].easing).toBeUndefined();
    expect(track.keyframes[1]).toMatchObject({ time: 1, value: 1, easing: 'spring' });
  });

  it('keeps a duration property alongside tracks', () => {
    const tl = timelineOf(`composition Demo {
      timeline scene {
        duration: 2.0
        track "rotationY" { key 0 {0}; key 1 {6.28} easing bounce }
      }
    }`);

    expect(tl.properties.duration).toBe(2);
    const track = tl.children.find((c: any) => c.type === 'track');
    expect(track.target).toBe('rotationY');
    expect(track.keyframes[1].easing).toBe('bounce');
  });

  it('accepts newline-separated keyframes, identifier targets, and negative values', () => {
    const tl = timelineOf(`composition Demo {
      timeline t {
        track positionX {
          key 0 {-1}
          key 0.5 {0} easing ease_in_out
          key 1 {1}
        }
      }
    }`);

    const track = tl.children.find((c: any) => c.type === 'track');
    expect(track.target).toBe('positionX');
    expect(track.keyframes).toHaveLength(3);
    expect(track.keyframes[0].value).toBe(-1);
    expect(track.keyframes[1]).toMatchObject({ time: 0.5, value: 0, easing: 'ease_in_out' });
  });

  it('treats `track:` as a property, not a keyframe-track block', () => {
    const tl = timelineOf(`composition Demo {
      timeline t { track: "main" }
    }`);
    expect(tl.properties.track).toBe('main');
    expect(tl.children.filter((c: any) => c.type === 'track')).toHaveLength(0);
  });

  it('supports multiple tracks in one timeline', () => {
    const tl = timelineOf(`composition Demo {
      timeline multi {
        track "opacity" { key 0 {0}; key 1 {1} }
        track "scaleUniform" { key 0 {0.5}; key 1 {1} easing spring }
      }
    }`);
    const tracks = tl.children.filter((c: any) => c.type === 'track');
    expect(tracks.map((t: any) => t.target)).toEqual(['opacity', 'scaleUniform']);
    expect(tracks[1].keyframes[1].easing).toBe('spring');
  });
});
