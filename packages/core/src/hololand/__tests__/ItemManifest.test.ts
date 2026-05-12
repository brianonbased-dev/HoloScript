import { describe, it, expect } from 'vitest';
import {
  createHoloLandItem,
  linkItems,
  getItemChain,
  ITEM_DEFAULT_TICK_INTERVAL_MS,
  DEFAULT_ITEM_AUTONOMOUS_AGENDA,
} from '../ItemManifest';

describe('ItemManifest (W.506)', () => {
  it('factory produces a valid HoloLandItem with all 5 sovereign traits', () => {
    const item = createHoloLandItem('sword_001', 'Decayed Areadbhair');

    expect(item.id).toBe('sword_001');
    expect(item.name).toBe('Decayed Areadbhair');
    expect(item.displayName).toBe('Decayed Areadbhair');

    // Ancestry defaults
    expect(item.ancestry.originType).toBe('world_spawn');
    expect(item.ancestry.originId).toBe('world');

    // State defaults
    expect(item.state.durability).toBe(1.0);
    expect(item.state.corrosion).toBe(0.0);
    expect(item.state.awakened).toBe(false);

    // Trajectory defaults
    expect(item.trajectory.type).toBe('none');

    // Constraint defaults
    expect(item.constraint.description).toBe('');

    // Five sovereign traits present
    expect(item.verbalFingerprint).toBeDefined();
    expect(item.autonomousAgenda).toBeDefined();
    expect(item.reputationLedger).toBeDefined();
    expect(item.vocabularyRegister).toBeDefined();
    // speechAwareEncounter is optional
  });

  it('item autonomous agenda ticks slower than NPC default (per in-world day)', () => {
    const item = createHoloLandItem('sword_001', 'Test Sword');

    expect(item.autonomousAgenda.agent_class).toBe('item');
    expect(item.autonomousAgenda.tick_interval_ms).toBe(ITEM_DEFAULT_TICK_INTERVAL_MS);
    expect(item.autonomousAgenda.tick_interval_ms).toBe(86_400_000);

    // NPC default is 60_000 ms (1 min). Item is 1_440× slower.
    const npcDefault = 60_000;
    expect(item.autonomousAgenda.tick_interval_ms).toBeGreaterThan(npcDefault * 1_000);
  });

  it('overrides merge correctly with defaults', () => {
    const item = createHoloLandItem('sword_001', 'Test Sword', {
      displayName: 'Rusty Blade',
      description: 'A blade stuck in a corpse.',
      ancestry: {
        originType: 'drop',
        originId: 'boss_042',
        originName: 'Volenorse',
        loreEvent: 'Sunraku first expedition',
      },
      state: {
        durability: 0.3,
        corrosion: 0.8,
        restorationProgress: 0.1,
      },
      trajectory: {
        type: 'restoration',
        conditionDescription: 'Take to a Legendary Craftsman',
      },
      constraint: {
        description: 'Cannot equip torso armor while cursed',
        playstyleImpact: 'Forces half-naked playstyle',
      },
      verbalFingerprint: {
        fingerprint_key: 'cursed_rust',
        style: { tone: 'archaic', label: 'cursed_rust' },
      },
      vocabularyRegister: {
        active_register: 'ancient-formal',
      },
      tags: ['weapon', 'cursed', 'grateful-class'],
    });

    expect(item.displayName).toBe('Rusty Blade');
    expect(item.ancestry.originType).toBe('drop');
    expect(item.ancestry.originName).toBe('Volenorse');
    expect(item.state.durability).toBe(0.3);
    expect(item.state.corrosion).toBe(0.8);
    expect(item.trajectory.type).toBe('restoration');
    expect(item.constraint.playstyleImpact).toBe('Forces half-naked playstyle');
    expect(item.verbalFingerprint.fingerprint_key).toBe('cursed_rust');
    expect(item.vocabularyRegister.active_register).toBe('ancient-formal');
    expect(item.tags).toContain('cursed');
  });

  it('linkItems wires lore chain correctly', () => {
    const colossusDrop = createHoloLandItem('drop_001', 'Arctus Regalecus Material', {
      ancestry: { originType: 'boss_summon', originId: 'ctarnidd', originName: 'Ctarnidd of the Abyss' },
      chainDepth: 0,
    });

    const craftedGear = createHoloLandItem('gear_001', 'Visored Helmet', {
      ancestry: { originType: 'npc_craft', originId: 'bilac', originName: 'Bilac the Blacksmith' },
      chainDepth: 0, // will be overwritten by linkItems
    });

    linkItems(colossusDrop, craftedGear);

    expect(colossusDrop.nextItemId).toBe('gear_001');
    expect(craftedGear.previousItemId).toBe('drop_001');
    expect(craftedGear.chainDepth).toBe(1);
    expect(craftedGear.ancestry.materialSourceItemId).toBe('drop_001');
  });

  it('getItemChain reconstructs full ancestry from an index', () => {
    const origin = createHoloLandItem('origin_001', 'Origin', { chainDepth: 0 });
    const mid = createHoloLandItem('mid_001', 'Mid', { chainDepth: 0 });
    const end = createHoloLandItem('end_001', 'End', { chainDepth: 0 });

    linkItems(origin, mid);
    linkItems(mid, end);

    const index = new Map([
      [origin.id, origin],
      [mid.id, mid],
      [end.id, end],
    ]);

    const chain = getItemChain(end, index);
    expect(chain).toHaveLength(3);
    expect(chain[0].id).toBe('origin_001');
    expect(chain[1].id).toBe('mid_001');
    expect(chain[2].id).toBe('end_001');
  });

  it('reputation ledger subject_id auto-binds to item id', () => {
    const item = createHoloLandItem('sword_001', 'Test Sword');
    expect(item.reputationLedger.subject_id).toBe('sword_001');
  });

  it('speechAwareEncounter is optional and can be attached', () => {
    const itemWithout = createHoloLandItem('sword_001', 'Silent Sword');
    expect(itemWithout.speechAwareEncounter).toBeUndefined();

    const itemWith = createHoloLandItem('sword_002', 'Oathblade', {
      speechAwareEncounter: {
        voice_enabled: false,
        reid_confidence_threshold: 0.75,
        fallback_to_text: true,
        max_turns: 50,
        reid_backend: 'reid_local',
      },
    });
    expect(itemWith.speechAwareEncounter).toBeDefined();
    expect(itemWith.speechAwareEncounter!.voice_enabled).toBe(false);
  });

  it('DEFAULT_ITEM_AUTONOMOUS_AGENDA uses item agent class', () => {
    expect(DEFAULT_ITEM_AUTONOMOUS_AGENDA.agent_class).toBe('item');
  });
});
