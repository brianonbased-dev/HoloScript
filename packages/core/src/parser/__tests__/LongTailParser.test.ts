import { describe, expect, it } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';

describe('A-009 long-tail parser drift', () => {
  it('parses newline-separated object literals inside arrays', () => {
    const result = parseHolo(`
      composition "AvatarArray" {
        object "Avatar" {
          @morph {
            targets: [
              { name: "short", weight: 0, category: "body" }
              { name: "tall", weight: 1, category: "body" }
            ]
          }
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    const morph = result.ast?.objects[0].traits.find((trait) => trait.name === 'morph');
    expect(morph?.config.targets).toEqual([
      { name: 'short', weight: 0, category: 'body' },
      { name: 'tall', weight: 1, category: 'body' },
    ]);
  });

  it('parses hash color literals in domain and object properties', () => {
    const result = parseHolo(`
      composition "MaterialHash" {
        material "Steel" {
          baseColor: #00ffaa
          outline: #000000
        }
        object "Panel" {
          material: { color: #112233 }
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.ast?.domainBlocks[0].properties.baseColor).toBe('#00ffaa');
    expect(result.ast?.domainBlocks[0].properties.outline).toBe('#000000');
    expect(result.ast?.objects[0].properties[0].value).toEqual({ color: '#112233' });
  });

  it('parses loose material-family blocks and labeled shader passes', () => {
    const result = parseHolo(`
      subsurface_material "Skin" @sss {
        baseColor: #ddb8a0
        normal_map {
          source: "textures/skin_normal.png"
          strength: 0.8
        }
      }

      shader "CustomTerrain" {
        pass "ForwardBase" {
          vertex: "terrain.vert"
          fragment: "terrain.frag"
        }
        heightBlend -> material.baseColor
      }
    `);

    expect(result.errors).toHaveLength(0);
    const material = result.ast?.domainBlocks.find((block) => block.keyword === 'subsurface_material');
    const shader = result.ast?.domainBlocks.find((block) => block.keyword === 'shader');
    expect(material?.properties.baseColor).toBe('#ddb8a0');
    expect(material?.properties.normal_map).toEqual({
      source: 'textures/skin_normal.png',
      strength: 0.8,
    });
    expect(shader?.properties.pass).toEqual({
      name: 'ForwardBase',
      vertex: 'terrain.vert',
      fragment: 'terrain.frag',
    });
    expect(shader?.properties.connections).toEqual([
      { from: 'heightBlend', to: 'material.baseColor' },
    ]);
  });

  it('parses topic and channel as trait config property names', () => {
    const result = parseHolo(`
      composition "IoTConfig" {
        object "Thermostat" {
          @sensor {
            topic: "home/thermostat/temperature"
            channel: "alerts"
          }
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    const sensor = result.ast?.objects[0].traits.find((trait) => trait.name === 'sensor');
    expect(sensor?.config.topic).toBe('home/thermostat/temperature');
    expect(sensor?.config.channel).toBe('alerts');
  });

  it('parses optional service schema fields and body decorators', () => {
    const result = parseHolo(`
      composition "UserAPI" {
        schema "User" @schema @contract {
          id: string
          role?: string
          users: array<User>
        }

        endpoint "listUsers" @endpoint @handler {
          params {
            page?: number
            limit?: number
          }
          response_200: User
        }

        service "UserAPI" @service {
          @cors_policy
          @rate_limiter
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    const schema = result.ast?.domainBlocks.find((block) => block.keyword === 'schema');
    const endpoint = result.ast?.domainBlocks.find((block) => block.keyword === 'endpoint');
    const service = result.ast?.domainBlocks.find((block) => block.keyword === 'service');

    expect(schema?.properties['role?']).toBe('string');
    expect(schema?.properties.users).toBe('array<User>');
    expect(endpoint?.properties.params).toEqual({ 'page?': 'number', 'limit?': 'number' });
    expect(service?.traits).toEqual(expect.arrayContaining(['service', 'cors_policy', 'rate_limiter']));
  });

  it('parses keyword trait values after @', () => {
    const result = parseHolo(`
      composition "TraitValue" {
        object "Marker" {
          label_trait: @state
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.ast?.objects[0].properties[0].value).toBe('@state');
  });

  it('parses reserved keyword action names without stalling', () => {
    const result = parseHolo(`
      composition "WalletActions" {
        template "WalletConnector" {
          action connect() {
            emit("wallet_connected", {
              address: wallet.address
            })
          }
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.ast?.templates[0].actions[0].name).toBe('connect');
  });

  it('parses custom named root blocks with keyword-valued properties', () => {
    const result = parseHolo(`
      preset "AtmosphereClearDay" {
        pipeline: "Atmosphere"
        overrides: {
          sky.turbidity: 1.5
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.ast?.domainBlocks[0].keyword).toBe('preset');
    expect(result.ast?.domainBlocks[0].properties.pipeline).toBe('Atmosphere');
  });

  it('parses colon-form state overrides as object properties', () => {
    const result = parseHolo(`
      composition "StateOverride" {
        object "HeartRateCard" using "VitalCard" {
          state: {
            label: "HR"
            value: "72"
          }
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.ast?.objects[0].properties[0]).toEqual({
      type: 'ObjectProperty',
      key: 'state',
      value: { label: 'HR', value: '72' },
    });
  });

  it('parses call-like bareword property values', () => {
    const result = parseHolo(`
      workflow "PaymentConfirmation" {
        subscription: ref(plan.pro)
        onClick: advanceStep()
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.ast?.domainBlocks[0].properties.subscription).toBe('ref(plan.pro)');
    expect(result.ast?.domainBlocks[0].properties.onClick).toBe('advanceStep()');
  });

  it('skips root-level arrow event handlers', () => {
    const result = parseHolo(`
      composition "EventHandlers" {
        object "VolumeKnob" {
          knob: { enabled: true }
        }

        on VolumeKnob.knob.rotated -> (event) {
          console.log(event.angle)
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.ast?.objects[0].name).toBe('VolumeKnob');
  });

  it('parses primitive children inside named dashboard domain blocks', () => {
    const result = parseHolo(`
      composition "DashboardWidgets" {
        panel "HUD" {
          position: "top-right"
          text "Title" { content: "WORLD BUILDER"; style: "heading" }
          text "Blocks" { bind: BuilderState.state.blocks_placed; style: "info" }
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    const panel = result.ast?.domainBlocks[0];
    expect(panel?.keyword).toBe('panel');
    expect(panel?.children?.map((child) => child.name)).toEqual(['Title', 'Blocks']);
    expect(panel?.children?.[0].properties).toContainEqual({
      type: 'ObjectProperty',
      key: 'geometry',
      value: 'text',
    });
    expect(panel?.children?.[1].properties).toContainEqual({
      type: 'ObjectProperty',
      key: 'bind',
      value: 'BuilderState.state.blocks_placed',
    });
  });

  it('parses nested camera blocks inside AR environment configuration', () => {
    const result = parseHolo(`
      composition "ARCameraEnvironment" {
        environment {
          ar_mode: true
          face_tracking: {
            enabled: true
            max_faces: 1
          }
          camera {
            clear_mode: "ar_background"
            mode: "front_facing"
            near_clip: 0.01
            far_clip: 5
          }
        }
      }
    `);

    expect(result.errors).toHaveLength(0);
    const properties = Object.fromEntries(
      result.ast?.environment?.properties.map((property) => [property.key, property.value]) ?? []
    );
    expect(properties.camera).toEqual({
      clear_mode: 'ar_background',
      mode: 'front_facing',
      near_clip: 0.01,
      far_clip: 5,
    });
  });
});
