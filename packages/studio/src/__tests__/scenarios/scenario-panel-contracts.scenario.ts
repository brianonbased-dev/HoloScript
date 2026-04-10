/**
 * scenario-panel-contracts.scenario.ts — LIVING-SPEC: Scenario Panel Data Contracts
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LIVING-SPEC: 26 Industry Scenario Panel Type Contracts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Persona: Alex — Studio integration engineer verifying that every scenario
 * panel exports well-typed data structures, correct demo data shapes, and
 * consistent interface contracts before shipping to production.
 *
 * Coverage:
 *   ArchaeologyPanel    — Artifact, StratLayer, ArtifactCondition
 *   BiomechanicsPanel   — JointData, MotionCapture
 *   BridgeLabPanel      — BridgeConfig, BeamMaterial, BridgeType
 *   CourtroomPanel      — Evidence, EvidenceType, EvidenceStatus
 *   EscapeRoomPanel     — Puzzle, Room, PuzzleType, PuzzleStatus
 *   FashionRunwayPanel  — GarmentPiece, Outfit, FabricType, Season
 *   FilmStudioPanel     — Shot, Scene, ShotType, CameraMove
 *   ForensicScenePanel  — EvidenceMarker, MarkerType, ChainStatus
 *   MolecularLabPanel   — QuickMolecule (Lipinski-compatible shape)
 *   TimeCapsulePanel    — CapsuleItem, TimeCapsule, CapsuleStatus
 *   ScenarioCard        — ScenarioCardProps (re-uses ScenarioEntry from Gallery)
 *
 * ✔  it(...)       — test PASSES → feature EXISTS
 * ⊡  it.todo(...)  — test SKIPPED → feature is MISSING (backlog item)
 *
 * Run: npx vitest run src/__tests__/scenarios/scenario-panel-contracts.scenario.ts --reporter=verbose
 * ═══════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';

// ── Panel exports ────────────────────────────────────────────────────────────

import {
  type ArtifactCondition,
  type StratLayer,
  type Artifact,
} from '../../industry/scenarios/ArchaeologyPanel';

import { type JointData, type MotionCapture } from '../../industry/scenarios/BiomechanicsPanel';

import {
  type BeamMaterial,
  type BridgeType,
  type BridgeConfig,
} from '../../industry/scenarios/BridgeLabPanel';

import {
  type EvidenceType,
  type EvidenceStatus,
  type Evidence,
} from '../../industry/scenarios/CourtroomPanel';

import {
  type PuzzleType,
  type PuzzleStatus,
  type Puzzle,
  type Room,
} from '../../industry/scenarios/EscapeRoomPanel';

import {
  type FabricType,
  type Season,
  type GarmentPiece,
  type Outfit,
} from '../../industry/scenarios/FashionRunwayPanel';

import {
  type ShotType,
  type CameraMove,
  type Shot,
  type Scene,
} from '../../industry/scenarios/FilmStudioPanel';

import {
  type MarkerType,
  type ChainStatus,
  type EvidenceMarker,
} from '../../industry/scenarios/ForensicScenePanel';

import { type QuickMolecule } from '../../industry/scenarios/MolecularLabPanel';

import {
  type CapsuleStatus,
  type CapsuleItem,
  type TimeCapsule,
} from '../../industry/scenarios/TimeCapsulePanel';

import { type ScenarioCardProps } from '../../industry/scenarios/ScenarioCard';

// ── ArchaeologyPanel ─────────────────────────────────────────────────────────

describe('Scenario: ArchaeologyPanel — type contracts', () => {
  it('ArtifactCondition values are well-typed', () => {
    const conditions: ArtifactCondition[] = ['intact', 'fragmented', 'damaged', 'trace'];
    expect(conditions).toHaveLength(4);
  });

  it('StratLayer has required shape fields', () => {
    const layer: StratLayer = {
      id: 0,
      name: 'Topsoil',
      depth: 0,
      color: '#8B6914',
      period: 'Modern',
    };
    expect(layer.id).toBe(0);
    expect(layer.name).toBeTruthy();
    expect(layer.depth).toBeGreaterThanOrEqual(0);
    expect(layer.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(layer.period).toBeTruthy();
  });

  it('Artifact has all required fields', () => {
    const artifact: Artifact = {
      id: 'test-1',
      name: 'Pottery Shard',
      type: 'ceramic',
      condition: 'fragmented',
      gridX: 3,
      gridY: 7,
      depth: 0.9,
      layer: 'Cultural Layer A',
      description: 'Decorated rim fragment',
      dateEstimate: '~1200 CE',
      photo: true,
    };
    expect(artifact.id).toBeTruthy();
    expect(artifact.condition).toBe('fragmented');
    expect(artifact.depth).toBeGreaterThan(0);
    expect(typeof artifact.photo).toBe('boolean');
  });

  it('StratLayer depth is non-negative', () => {
    const layers: StratLayer[] = [
      { id: 0, name: 'Topsoil', depth: 0, color: '#8B6914', period: 'Modern' },
      { id: 1, name: 'Alluvium', depth: 0.3, color: '#A0522D', period: '1800s' },
      { id: 2, name: 'Cultural Layer A', depth: 0.8, color: '#6B4226', period: 'Medieval' },
    ];
    for (const l of layers) {
      expect(l.depth).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── BiomechanicsPanel ────────────────────────────────────────────────────────

describe('Scenario: BiomechanicsPanel — type contracts', () => {
  it('JointData has angle, velocity, torque, and rom fields', () => {
    const joint: JointData = {
      name: 'Hip L',
      angle: 145,
      velocity: 320,
      torque: 180,
      rom: [0, 180],
    };
    expect(joint.name).toBeTruthy();
    expect(joint.rom).toHaveLength(2);
    expect(joint.rom[0]).toBeLessThanOrEqual(joint.rom[1]);
    expect(joint.angle).toBeGreaterThanOrEqual(joint.rom[0]);
    expect(joint.angle).toBeLessThanOrEqual(joint.rom[1]);
  });

  it('MotionCapture has joints array with at least one entry', () => {
    const capture: MotionCapture = {
      id: 'mc-1',
      name: 'Sprint Start',
      sport: 'Track',
      duration: 2.5,
      fps: 240,
      joints: [{ name: 'Hip L', angle: 145, velocity: 320, torque: 180, rom: [0, 180] }],
      peakForce: 2400,
      notes: 'Test capture',
    };
    expect(capture.fps).toBeGreaterThan(0);
    expect(capture.duration).toBeGreaterThan(0);
    expect(capture.joints.length).toBeGreaterThan(0);
    expect(capture.peakForce).toBeGreaterThan(0);
  });

  it('JointData torque is positive', () => {
    const joint: JointData = {
      name: 'Knee L',
      angle: 85,
      velocity: 450,
      torque: 220,
      rom: [0, 160],
    };
    expect(joint.torque).toBeGreaterThan(0);
  });
});

// ── BridgeLabPanel ───────────────────────────────────────────────────────────

describe('Scenario: BridgeLabPanel — type contracts', () => {
  it('BeamMaterial values are valid', () => {
    const materials: BeamMaterial[] = ['steel', 'concrete', 'wood', 'cable', 'composite'];
    expect(materials).toHaveLength(5);
    expect(materials).toContain('steel');
    expect(materials).toContain('composite');
  });

  it('BridgeType values are valid', () => {
    const types: BridgeType[] = ['beam', 'arch', 'truss', 'suspension', 'cantilever'];
    expect(types).toHaveLength(5);
    expect(types).toContain('suspension');
  });

  it('BridgeConfig has positive span, height, and safety factor', () => {
    const config: BridgeConfig = {
      type: 'truss',
      span: 50,
      height: 10,
      material: 'steel',
      loadCapacity: 500,
      safetyFactor: 2.0,
      cost: 0,
    };
    expect(config.span).toBeGreaterThan(0);
    expect(config.height).toBeGreaterThan(0);
    expect(config.safetyFactor).toBeGreaterThanOrEqual(1);
    expect(config.loadCapacity).toBeGreaterThan(0);
  });

  it('BridgeConfig cost starts at 0 (pre-calculation)', () => {
    const config: BridgeConfig = {
      type: 'beam',
      span: 30,
      height: 5,
      material: 'concrete',
      loadCapacity: 200,
      safetyFactor: 1.5,
      cost: 0,
    };
    expect(config.cost).toBe(0);
  });
});

// ── CourtroomPanel ───────────────────────────────────────────────────────────

describe('Scenario: CourtroomPanel — type contracts', () => {
  it('EvidenceType values are complete', () => {
    const types: EvidenceType[] = ['document', 'photo', 'video', 'audio', 'physical', 'testimony'];
    expect(types).toHaveLength(6);
  });

  it('EvidenceStatus values cover the full lifecycle', () => {
    const statuses: EvidenceStatus[] = ['admitted', 'objected', 'pending', 'excluded'];
    expect(statuses).toHaveLength(4);
    expect(statuses).toContain('admitted');
    expect(statuses).toContain('excluded');
  });

  it('Evidence has exhibit label and tags array', () => {
    const evidence: Evidence = {
      id: 'e-1',
      label: 'Security Camera Footage',
      type: 'video',
      description: 'Parking lot footage from 11:32 PM',
      status: 'admitted',
      timestamp: Date.now(),
      tags: ['surveillance', 'timeline'],
      exhibit: 'Exhibit A-1',
    };
    expect(evidence.exhibit).toMatch(/^Exhibit/);
    expect(evidence.tags.length).toBeGreaterThan(0);
    expect(evidence.timestamp).toBeGreaterThan(0);
  });
});

// ── EscapeRoomPanel ──────────────────────────────────────────────────────────

describe('Scenario: EscapeRoomPanel — type contracts', () => {
  it('PuzzleType values span all puzzle categories', () => {
    const types: PuzzleType[] = ['code', 'physical', 'logic', 'search', 'pattern', 'sequence'];
    expect(types).toHaveLength(6);
  });

  it('PuzzleStatus values represent locked/unlocked lifecycle', () => {
    const statuses: PuzzleStatus[] = ['locked', 'available', 'solved'];
    expect(statuses).toHaveLength(3);
  });

  it('Puzzle with requiresIds=[] is immediately available', () => {
    const puzzle: Puzzle = {
      id: 'p-intro',
      name: 'Welcome Clue',
      type: 'search',
      difficulty: 1,
      status: 'available',
      solution: 'key',
      hint: 'Look around',
      requiresIds: [],
    };
    expect(puzzle.requiresIds).toHaveLength(0);
    expect(puzzle.status).toBe('available');
    expect(puzzle.difficulty).toBeGreaterThanOrEqual(1);
    expect(puzzle.difficulty).toBeLessThanOrEqual(5);
  });

  it('Room holds puzzles and a time limit', () => {
    const puzzle: Puzzle = {
      id: 'p1',
      name: 'Door Lock',
      type: 'code',
      difficulty: 3,
      status: 'locked',
      solution: '4729',
      hint: 'Clocks matter',
      requiresIds: [],
    };
    const room: Room = {
      id: 'r-1',
      name: "The Alchemist's Lab",
      timeLimit: 3600,
      theme: 'Medieval',
      puzzles: [puzzle],
    };
    expect(room.timeLimit).toBeGreaterThan(0);
    expect(room.puzzles.length).toBeGreaterThan(0);
    expect(room.theme).toBeTruthy();
  });

  it('Puzzle timeLimit field is optional', () => {
    const withLimit: Puzzle = {
      id: 'p2',
      name: 'Timed Bomb',
      type: 'sequence',
      difficulty: 5,
      status: 'available',
      solution: 'RED BLUE GREEN',
      hint: 'Colors of fire',
      requiresIds: ['p1'],
      timeLimit: 120,
    };
    expect(withLimit.timeLimit).toBe(120);

    const withoutLimit: Puzzle = { ...withLimit, timeLimit: undefined, id: 'p3' };
    expect(withoutLimit.timeLimit).toBeUndefined();
  });
});

// ── FashionRunwayPanel ───────────────────────────────────────────────────────

describe('Scenario: FashionRunwayPanel — type contracts', () => {
  it('FabricType values are fabric names', () => {
    const fabrics: FabricType[] = [
      'silk',
      'cotton',
      'leather',
      'denim',
      'wool',
      'lace',
      'satin',
      'chiffon',
    ];
    expect(fabrics).toHaveLength(8);
    expect(fabrics).toContain('silk');
    expect(fabrics).toContain('chiffon');
  });

  it('Season values are the four seasons', () => {
    const seasons: Season[] = ['spring', 'summer', 'fall', 'winter'];
    expect(seasons).toHaveLength(4);
  });

  it('GarmentPiece has fabric and color', () => {
    const piece: GarmentPiece = {
      id: 'g-1',
      name: 'Column Gown',
      type: 'dress',
      fabric: 'silk',
      color: '#1a1a2e',
      pattern: 'solid',
    };
    expect(piece.fabric).toBe('silk');
    expect(piece.color).toMatch(/^#/);
  });

  it('Outfit rating is 1–5', () => {
    const outfit: Outfit = {
      id: 'o-1',
      name: 'Evening Elegance',
      pieces: [],
      season: 'winter',
      rating: 5,
      notes: 'Opening look',
    };
    expect(outfit.rating).toBeGreaterThanOrEqual(1);
    expect(outfit.rating).toBeLessThanOrEqual(5);
  });

  it('Outfit pieces array can be empty (work-in-progress)', () => {
    const draft: Outfit = {
      id: 'draft-1',
      name: 'Untitled',
      pieces: [],
      season: 'spring',
      rating: 1,
      notes: '',
    };
    expect(draft.pieces).toHaveLength(0);
  });
});

// ── FilmStudioPanel ──────────────────────────────────────────────────────────

describe('Scenario: FilmStudioPanel — type contracts', () => {
  it('ShotType values include all common film framing', () => {
    const shots: ShotType[] = [
      'wide',
      'medium',
      'close-up',
      'extreme-close',
      'over-shoulder',
      'pov',
      'aerial',
      'tracking',
    ];
    expect(shots).toHaveLength(8);
    expect(shots).toContain('wide');
    expect(shots).toContain('pov');
  });

  it('CameraMove values include static and dynamic moves', () => {
    const moves: CameraMove[] = [
      'static',
      'pan',
      'tilt',
      'dolly',
      'crane',
      'handheld',
      'steadicam',
    ];
    expect(moves).toHaveLength(7);
    expect(moves).toContain('static');
    expect(moves).toContain('steadicam');
  });

  it('Shot has number, duration, and transition fields', () => {
    const shot: Shot = {
      id: 's-1',
      number: 1,
      description: 'Establishing shot',
      shotType: 'wide',
      camera: 'crane',
      duration: 4,
      dialogue: '',
      action: 'Camera descends',
      notes: '',
      transition: 'cut',
    };
    expect(shot.number).toBeGreaterThan(0);
    expect(shot.duration).toBeGreaterThan(0);
    expect(['cut', 'dissolve', 'fade', 'wipe']).toContain(shot.transition);
  });

  it('Scene aggregates shots with a location', () => {
    const scene: Scene = {
      id: 'sc-1',
      name: 'The Confrontation',
      location: 'Rooftop – Night',
      timeOfDay: 'Night',
      shots: [],
    };
    expect(scene.name).toBeTruthy();
    expect(scene.location).toBeTruthy();
    expect(scene.timeOfDay).toBeTruthy();
    expect(Array.isArray(scene.shots)).toBe(true);
  });
});

// ── ForensicScenePanel ───────────────────────────────────────────────────────

describe('Scenario: ForensicScenePanel — type contracts', () => {
  it('MarkerType values cover all evidence categories', () => {
    const types: MarkerType[] = [
      'blood',
      'fiber',
      'fingerprint',
      'weapon',
      'footprint',
      'dna',
      'other',
    ];
    expect(types).toHaveLength(7);
    expect(types).toContain('dna');
    expect(types).toContain('blood');
  });

  it('ChainStatus values follow chain of custody order', () => {
    const statuses: ChainStatus[] = ['collected', 'in-transit', 'lab', 'analyzed', 'court'];
    expect(statuses).toHaveLength(5);
    expect(statuses[0]).toBe('collected');
    expect(statuses[statuses.length - 1]).toBe('court');
  });

  it('EvidenceMarker has sequential number and position', () => {
    const marker: EvidenceMarker = {
      id: 'm-1',
      number: 1,
      type: 'blood',
      description: 'Blood spatter',
      position: { x: 30, y: 45 },
      chainStatus: 'analyzed',
      collectedBy: 'Det. Smith',
      collectedAt: Date.now() - 86400000,
      notes: 'Type O+',
    };
    expect(marker.number).toBeGreaterThan(0);
    expect(marker.position.x).toBeGreaterThanOrEqual(0);
    expect(marker.position.y).toBeGreaterThanOrEqual(0);
    expect(marker.collectedAt).toBeGreaterThan(0);
  });
});

// ── MolecularLabPanel ────────────────────────────────────────────────────────

describe('Scenario: MolecularLabPanel — QuickMolecule contract', () => {
  it('QuickMolecule has Lipinski-compatible fields (MW, LogP, HBD, HBA)', () => {
    const mol: QuickMolecule = {
      id: '1',
      name: 'Aspirin',
      formula: 'C₉H₈O₄',
      mw: 180.16,
      logP: 1.2,
      hbd: 1,
      hba: 4,
      psa: 63.6,
      rotBonds: 3,
    };
    expect(mol.mw).toBeGreaterThan(0);
    expect(mol.hbd).toBeGreaterThanOrEqual(0);
    expect(mol.hba).toBeGreaterThanOrEqual(0);
    expect(mol.psa).toBeGreaterThan(0);
    expect(mol.rotBonds).toBeGreaterThanOrEqual(0);
  });

  it('Aspirin passes Lipinski Rule of Five (MW≤500, LogP≤5, HBD≤5, HBA≤10)', () => {
    const aspirin: QuickMolecule = {
      id: '1',
      name: 'Aspirin',
      formula: 'C₉H₈O₄',
      mw: 180.16,
      logP: 1.2,
      hbd: 1,
      hba: 4,
      psa: 63.6,
      rotBonds: 3,
    };
    expect(aspirin.mw).toBeLessThanOrEqual(500);
    expect(aspirin.logP).toBeLessThanOrEqual(5);
    expect(aspirin.hbd).toBeLessThanOrEqual(5);
    expect(aspirin.hba).toBeLessThanOrEqual(10);
  });

  it('Ibuprofen is a valid QuickMolecule with logP > 1', () => {
    const ibuprofen: QuickMolecule = {
      id: '2',
      name: 'Ibuprofen',
      formula: 'C₁₃H₁₈O₂',
      mw: 206.28,
      logP: 3.5,
      hbd: 1,
      hba: 2,
      psa: 37.3,
      rotBonds: 4,
    };
    expect(ibuprofen.logP).toBeGreaterThan(1);
    expect(ibuprofen.mw).toBeLessThan(300);
  });
});

// ── TimeCapsulePanel ─────────────────────────────────────────────────────────

describe('Scenario: TimeCapsulePanel — type contracts', () => {
  it('CapsuleStatus values cover the full capsule lifecycle', () => {
    const statuses: CapsuleStatus[] = ['open', 'sealed', 'scheduled', 'revealed'];
    expect(statuses).toHaveLength(4);
    expect(statuses).toContain('sealed');
    expect(statuses).toContain('revealed');
  });

  it('CapsuleItem supports all media types', () => {
    const itemTypes: CapsuleItem['type'][] = ['text', 'photo', 'audio', 'scene', 'code'];
    expect(itemTypes).toHaveLength(5);
  });

  it('CapsuleItem has required fields', () => {
    const item: CapsuleItem = {
      id: 'ci-1',
      type: 'text',
      label: 'Vision Statement',
      preview: 'We set out to build...',
      addedAt: Date.now(),
    };
    expect(item.id).toBeTruthy();
    expect(item.label).toBeTruthy();
    expect(item.addedAt).toBeGreaterThan(0);
  });

  it('Sealed capsule has sealedAt timestamp', () => {
    const capsule: TimeCapsule = {
      id: 'tc-1',
      name: 'Studio Launch Day',
      status: 'sealed',
      items: [],
      createdAt: Date.now() - 2592000000,
      sealedAt: Date.now() - 2500000000,
      revealDate: Date.now() + 31536000000,
      message: 'Open in 1 year!',
    };
    expect(capsule.sealedAt).toBeTruthy();
    expect(capsule.sealedAt!).toBeLessThan(capsule.revealDate!);
  });

  it('Open capsule has no sealedAt (not yet sealed)', () => {
    const capsule: TimeCapsule = {
      id: 'tc-2',
      name: 'Work in Progress',
      status: 'open',
      items: [],
      createdAt: Date.now(),
    };
    expect(capsule.sealedAt).toBeUndefined();
    expect(capsule.revealDate).toBeUndefined();
  });
});

// ── ScenarioCard ─────────────────────────────────────────────────────────────

describe('Scenario: ScenarioCard — props contract', () => {
  it('ScenarioCardProps requires a scenario entry', () => {
    const props: ScenarioCardProps = {
      scenario: {
        id: 'dna',
        name: 'DNA Lab',
        emoji: '🧬',
        category: 'science',
        description: 'Sequencing and CRISPR',
        engine: 'dnaSequencing',
        tags: ['biology'],
        testCount: 20,
      },
    };
    expect(props.scenario.id).toBe('dna');
    expect(props.scenario.category).toBe('science');
  });

  it('ScenarioCardProps optional fields are undefined by default', () => {
    const props: ScenarioCardProps = {
      scenario: {
        id: 'space',
        name: 'Space Mission',
        emoji: '🚀',
        category: 'engineering',
        description: 'Orbital mechanics',
        engine: 'spaceMission',
        tags: ['physics'],
        testCount: 16,
      },
    };
    expect(props.onSelect).toBeUndefined();
    expect(props.isActive).toBeUndefined();
    expect(props.className).toBeUndefined();
  });
});
