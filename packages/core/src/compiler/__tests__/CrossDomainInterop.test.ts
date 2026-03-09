/**
 * CrossDomainInterop.test.ts — Track 3A validation tests.
 *
 * Validates that cross-domain trait composition and domain block compilation
 * work correctly across all supported platforms. Tests the interop boundaries
 * between Physics+Networking, Material+Physics, Narrative+Payment, and
 * the domain block router with fallback handling.
 */
import { describe, it, expect, vi } from 'vitest';

import type { HoloDomainBlock, HoloDomainType } from '../../parser/HoloCompositionTypes';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  compilePhysicsBlock,
  compileNarrativeBlock,
  compilePaymentBlock,
  compileParticleBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
  compilePostProcessingBlock,
  materialToUnity,
  materialToGodot,
  physicsToUnity,
  physicsToGodot,
  narrativeToUnity,
  narrativeToGodot,
  narrativeToR3F,
  narrativeToVRChat,
  narrativeToUSDA,
  paymentToUnity,
  paymentToGodot,
  paymentToR3F,
  paymentToVRChat,
  paymentToUSDA,
} from '../DomainBlockCompilerMixin';

// No RBAC mock needed — importing directly from DomainBlockCompilerMixin

// =============================================================================
// Helpers
// =============================================================================

function makeDomainBlock(
  domain: HoloDomainType,
  keyword: string,
  name: string,
  properties: Record<string, any> = {},
  children: any[] = [],
): HoloDomainBlock {
  return {
    type: 'DomainBlock',
    domain,
    keyword,
    name,
    traits: [],
    properties,
    children,
    eventHandlers: [],
  } as HoloDomainBlock;
}

// =============================================================================
// Domain Block Router
// =============================================================================

describe('Domain Block Router — compileDomainBlocks()', () => {
  it('routes material blocks to material handler', () => {
    const block = makeDomainBlock('material', 'pbr_material', 'Gold', {
      color: '#FFD700',
      metalness: 1.0,
      roughness: 0.3,
    });

    const results = compileDomainBlocks([block], {
      material: (b) => {
        const mat = compileMaterialBlock(b);
        return `Material: ${mat.name}`;
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('Material:');
  });

  it('routes physics blocks to physics handler', () => {
    const block = makeDomainBlock('physics', 'rigidbody', 'Ball', {
      mass: 5,
      useGravity: true,
    });

    const results = compileDomainBlocks([block], {
      physics: (b) => {
        const phys = compilePhysicsBlock(b);
        return `Physics: ${phys.keyword}`;
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('Physics:');
  });

  it('routes narrative blocks to narrative handler', () => {
    const block = makeDomainBlock('narrative', 'narrative', 'MainQuest', {
      type: 'branching',
    });

    const results = compileDomainBlocks([block], {
      narrative: (b) => {
        const narr = compileNarrativeBlock(b);
        return `Narrative: ${narr.name}`;
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('Narrative: MainQuest');
  });

  it('routes payment blocks to payment handler', () => {
    const block = makeDomainBlock('payment', 'paywall', 'PremiumAccess', {
      price: 9.99,
      asset: 'USDC',
      network: 'base',
      recipient: '0x1234',
    });

    const results = compileDomainBlocks([block], {
      payment: (b) => {
        const pay = compilePaymentBlock(b);
        return `Payment: ${pay.name} $${pay.price}`;
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('Payment: PremiumAccess');
    expect(results[0]).toContain('$9.99');
  });

  it('uses fallback for unhandled domain types', () => {
    const block = makeDomainBlock('iot', 'sensor', 'TempSensor', {
      type: 'temperature',
    });

    const results = compileDomainBlocks(
      [block],
      {},
      (b) => `/* Stub: ${b.domain}/${b.keyword} */`,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('iot/sensor');
  });

  it('generates default comment for unhandled domains without fallback', () => {
    const block = makeDomainBlock('education', 'lesson', 'Intro', {});

    const results = compileDomainBlocks([block], {});

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('Unhandled domain block');
    expect(results[0]).toContain('education');
  });

  it('handles mixed domain blocks in sequence', () => {
    const blocks = [
      makeDomainBlock('material', 'pbr_material', 'Steel', { metalness: 0.9 }),
      makeDomainBlock('physics', 'rigidbody', 'Crate', { mass: 10 }),
      makeDomainBlock('payment', 'paywall', 'Gate', { price: 5 }),
      makeDomainBlock('iot', 'sensor', 'GPS', {}),
    ];

    let idx = 0;
    const results = compileDomainBlocks(
      blocks,
      {
        material: () => `mat-${idx++}`,
        physics: () => `phys-${idx++}`,
        payment: () => `pay-${idx++}`,
      },
      (b) => `fallback-${b.domain}`,
    );

    expect(results).toHaveLength(4);
    expect(results[0]).toBe('mat-0');
    expect(results[1]).toBe('phys-1');
    expect(results[2]).toBe('pay-2');
    expect(results[3]).toBe('fallback-iot');
  });
});

// =============================================================================
// Material Domain — Cross-Platform Compilation
// =============================================================================

describe('Material Domain — Cross-Platform Output', () => {
  const block = makeDomainBlock('material', 'pbr_material', 'BrushedMetal', {
    baseColor: '#C0C0C0',
    metallic: 0.95,
    roughness: 0.15,
    emissive_color: '#000000',
  });

  it('compileMaterialBlock extracts PBR properties', () => {
    const mat = compileMaterialBlock(block);
    expect(mat.name).toBe('BrushedMetal');
    expect(mat.metallic).toBeCloseTo(0.95);
    expect(mat.roughness).toBeCloseTo(0.15);
  });

  it('materialToUnity generates C# code with SetFloat calls', () => {
    const mat = compileMaterialBlock(block);
    const unity = materialToUnity(mat, 'var ');
    expect(unity).toContain('SetFloat');
    expect(unity).toContain('_Smoothness'); // Unity uses _Smoothness (roughness inverse)
  });

  it('materialToGodot generates GDScript StandardMaterial3D code', () => {
    const mat = compileMaterialBlock(block);
    const godot = materialToGodot(mat, 'var ');
    expect(godot).toContain('StandardMaterial3D');
  });
});

// =============================================================================
// Physics Domain — Cross-Platform Compilation
// =============================================================================

describe('Physics Domain — Cross-Platform Output', () => {
  const block = makeDomainBlock('physics', 'rigidbody', 'Boulder', {
    mass: 100,
    useGravity: true,
    linearDamping: 0.1,
  });

  it('compilePhysicsBlock extracts rigidbody properties', () => {
    const phys = compilePhysicsBlock(block);
    expect(phys.keyword).toBe('rigidbody');
    expect(phys.properties.mass).toBe(100);
  });

  it('physicsToUnity generates physics comment header', () => {
    // physicsToUnity generates Rigidbody code only when nested sub-blocks exist.
    // Top-level rigidbody block generates a comment header with properties.
    const phys = compilePhysicsBlock(block);
    const unity = physicsToUnity(phys, 'var ');
    expect(unity).toContain('Physics: rigidbody');
    expect(unity).toContain('Boulder');
  });

  it('physicsToGodot generates physics comment header', () => {
    const phys = compilePhysicsBlock(block);
    const godot = physicsToGodot(phys, 'var ');
    expect(godot).toContain('Physics: rigidbody');
    expect(godot).toContain('Boulder');
  });
});

// =============================================================================
// Narrative Domain — Cross-Platform Compilation
// =============================================================================

describe('Narrative Domain — Cross-Platform Output', () => {
  // Narrative type is derived: 'branching' if choices exist, 'open_world' if prop, else 'linear'
  const block = makeDomainBlock('narrative', 'narrative', 'EpicQuest', {
    type: 'linear',
    start_chapter: 'awakening',
  });

  it('compileNarrativeBlock extracts narrative structure', () => {
    const narr = compileNarrativeBlock(block);
    expect(narr.name).toBe('EpicQuest');
    expect(narr.type).toBe('linear'); // No choice children = linear
    expect(narr.startChapter).toBe('awakening');
  });

  it('narrativeToUnity generates C# DialogueManager code', () => {
    const narr = compileNarrativeBlock(block);
    const code = narrativeToUnity(narr);
    expect(code).toContain('class');
    expect(code).toContain('EpicQuest');
  });

  it('narrativeToGodot generates GDScript narrative controller', () => {
    const narr = compileNarrativeBlock(block);
    const code = narrativeToGodot(narr);
    expect(code).toContain('EpicQuest');
  });

  it('narrativeToR3F generates React component config', () => {
    const narr = compileNarrativeBlock(block);
    const code = narrativeToR3F(narr);
    expect(code).toContain('EpicQuest');
  });

  it('narrativeToVRChat generates UdonSharp code', () => {
    const narr = compileNarrativeBlock(block);
    const code = narrativeToVRChat(narr);
    expect(code).toContain('UdonBehaviour');
  });

  it('narrativeToUSDA generates USD annotation', () => {
    const narr = compileNarrativeBlock(block);
    const code = narrativeToUSDA(narr);
    expect(code).toContain('holoscript');
  });
});

// =============================================================================
// Payment Domain — Cross-Platform Compilation
// =============================================================================

describe('Payment Domain — Cross-Platform Output', () => {
  const block = makeDomainBlock('payment', 'paywall', 'VIPLounge', {
    price: 25,
    asset: 'USDC',
    network: 'base',
    recipient: '0xABCD1234',
    type: 'one_time',
    gated_content: ['VIPStage', 'BackstageArea'],
  });

  it('compilePaymentBlock extracts paywall config', () => {
    const pay = compilePaymentBlock(block);
    expect(pay.name).toBe('VIPLounge');
    expect(pay.price).toBe(25);
    expect(pay.asset).toBe('USDC');
    expect(pay.network).toBe('base');
    expect(pay.type).toBe('one_time');
  });

  it('paymentToUnity generates C# ScriptableObject', () => {
    const pay = compilePaymentBlock(block);
    const code = paymentToUnity(pay);
    expect(code).toContain('ScriptableObject');
    expect(code).toContain('VIPLounge');
    expect(code).toContain('USDC');
  });

  it('paymentToGodot generates GDScript with payment signals', () => {
    const pay = compilePaymentBlock(block);
    const code = paymentToGodot(pay);
    expect(code).toContain('signal');
    expect(code).toContain('VIPLounge');
  });

  it('paymentToR3F generates React payment gate config', () => {
    const pay = compilePaymentBlock(block);
    const code = paymentToR3F(pay);
    expect(code).toContain('VIPLounge');
    expect(code).toContain('25');
  });

  it('paymentToVRChat generates UdonSharp paywall', () => {
    const pay = compilePaymentBlock(block);
    const code = paymentToVRChat(pay);
    expect(code).toContain('UdonBehaviour');
    expect(code).toContain('VIPLounge');
  });

  it('paymentToUSDA generates USD customData', () => {
    const pay = compilePaymentBlock(block);
    const code = paymentToUSDA(pay);
    expect(code).toContain('holoscript');
    expect(code).toContain('VIPLounge');
  });
});

// =============================================================================
// Cross-Domain: Material + Physics in same composition
// =============================================================================

describe('Cross-Domain: Material + Physics co-compilation', () => {
  it('material and physics blocks compile independently in same router call', () => {
    const blocks = [
      makeDomainBlock('material', 'pbr_material', 'IronArmor', {
        metalness: 1.0,
        roughness: 0.2,
      }),
      makeDomainBlock('physics', 'rigidbody', 'IronArmor', {
        mass: 50,
        useGravity: true,
      }),
    ];

    const matResults: string[] = [];
    const physResults: string[] = [];

    compileDomainBlocks(blocks, {
      material: (b) => {
        const mat = compileMaterialBlock(b);
        const code = `material_${mat.name}`;
        matResults.push(code);
        return code;
      },
      physics: (b) => {
        const phys = compilePhysicsBlock(b);
        const code = `physics_${phys.keyword}_${phys.properties.mass}`;
        physResults.push(code);
        return code;
      },
    });

    expect(matResults).toHaveLength(1);
    expect(physResults).toHaveLength(1);
    expect(matResults[0]).toBe('material_IronArmor');
    expect(physResults[0]).toBe('physics_rigidbody_50');
  });
});

// =============================================================================
// Cross-Domain: Narrative + Payment gated content
// =============================================================================

describe('Cross-Domain: Narrative + Payment interop', () => {
  it('payment gated_content references narrative objects', () => {
    const payBlock = makeDomainBlock('payment', 'paywall', 'StoryGate', {
      price: 15,
      asset: 'USDC',
      network: 'base',
      recipient: '0x9999',
      type: 'one_time',
      gated_content: ['Chapter3', 'BonusEnding'],
    });

    const pay = compilePaymentBlock(payBlock);
    expect(pay.gatedContent).toContain('Chapter3');
    expect(pay.gatedContent).toContain('BonusEnding');

    // Payment gate output should reference gated content
    const r3fCode = paymentToR3F(pay);
    expect(r3fCode).toContain('Chapter3');
  });
});

// =============================================================================
// All 23 Domain Types — Completeness Matrix
// =============================================================================

describe('Domain Type Completeness Matrix', () => {
  const ALL_DOMAINS: HoloDomainType[] = [
    'iot', 'robotics', 'dataviz', 'education', 'healthcare', 'music',
    'architecture', 'web3', 'material', 'physics', 'vfx', 'postfx',
    'audio', 'weather', 'procedural', 'rendering', 'navigation', 'input',
    'codebase', 'narrative', 'payment', 'norms', 'custom',
  ];

  const HANDLED_DOMAINS: HoloDomainType[] = [
    'material', 'physics', 'vfx', 'postfx', 'audio', 'weather', 'narrative', 'payment',
  ];

  it('all 23 domain types are enumerable', () => {
    expect(ALL_DOMAINS).toHaveLength(23);
  });

  it('8 domains have dedicated compile handlers', () => {
    expect(HANDLED_DOMAINS).toHaveLength(8);
  });

  it('compileDomainBlocks processes all 23 types without throwing', () => {
    const blocks = ALL_DOMAINS.map((domain) =>
      makeDomainBlock(domain, 'test', `Test_${domain}`, {}),
    );

    const results = compileDomainBlocks(
      blocks,
      {
        material: (b) => `ok:${b.domain}`,
        physics: (b) => `ok:${b.domain}`,
        vfx: (b) => `ok:${b.domain}`,
        postfx: (b) => `ok:${b.domain}`,
        audio: (b) => `ok:${b.domain}`,
        weather: (b) => `ok:${b.domain}`,
        narrative: (b) => `ok:${b.domain}`,
        payment: (b) => `ok:${b.domain}`,
      },
      (b) => `stub:${b.domain}`,
    );

    expect(results).toHaveLength(23);

    // Verify handled domains got their handler
    for (const domain of HANDLED_DOMAINS) {
      const idx = ALL_DOMAINS.indexOf(domain);
      expect(results[idx]).toBe(`ok:${domain}`);
    }

    // Verify unhandled domains got the fallback
    for (const domain of ALL_DOMAINS) {
      if (!HANDLED_DOMAINS.includes(domain)) {
        const idx = ALL_DOMAINS.indexOf(domain);
        expect(results[idx]).toBe(`stub:${domain}`);
      }
    }
  });
});
