/**
 * HoloGramMLSCompiler tests
 *
 * @see HoloGramMLSCompiler.ts
 */

import { describe, it, expect } from 'vitest';
import { HoloGramMLSCompiler, createHoloGramMLSCompiler } from '../HoloGramMLSCompiler';

const SAMPLE_PHOTOS = [
  { url: 'https://example.com/living1.jpg', room: 'Living Room', width: 1024, height: 768, caption: 'Living Room View' },
  { url: 'https://example.com/living2.jpg', room: 'Living Room', width: 800, height: 600 },
  { url: 'https://example.com/kitchen1.jpg', room: 'Kitchen', width: 1200, height: 900, caption: 'Kitchen Island' },
  { url: 'https://example.com/bedroom1.jpg', room: 'Master Bedroom', width: 1024, height: 768 },
];

describe('HoloGramMLSCompiler', () => {
  it('should instantiate with default options', () => {
    const compiler = new HoloGramMLSCompiler();
    expect(compiler.compilerName).toBe('hologram_mls');
    expect(compiler.version).toBe('1.0.0');
    expect(compiler.options.depthModel).toBe('depth-anything-v2-small');
  });

  it('should create via factory', () => {
    const compiler = createHoloGramMLSCompiler({ photoScale: 1.5, walkable: false });
    expect(compiler.options.photoScale).toBe(1.5);
    expect(compiler.options.walkable).toBe(false);
  });

  it('should compile a simple single-photo bundle', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({
      photos: [{ url: 'https://example.com/photo.jpg', room: 'Entry' }],
    });

    expect(result.success).toBe(true);
    expect(result.composition).toBeDefined();
    expect(result.stats.photos).toBe(1);
    expect(result.stats.rooms).toBe(1);
    expect(result.stats.lights).toBeGreaterThanOrEqual(2); // ambient + directional
    expect(result.stats.waypoints).toBe(0); // only 1 room = no waypoints needed
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should group photos by room', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    expect(result.success).toBe(true);
    expect(result.stats.photos).toBe(4);
    expect(result.stats.rooms).toBe(3); // Living Room, Kitchen, Master Bedroom
    expect(result.composition!.spatialGroups.length).toBe(3);
  });

  it('should create depth-estimation traits on photo objects', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    const photoObjects = result.composition!.objects.filter((o: any) =>
      o.traits?.some((t: any) => t.name === 'image')
    );
    expect(photoObjects.length).toBe(4);

    for (const obj of photoObjects) {
      const traitNames = obj.traits.map((t: any) => t.name);
      expect(traitNames).toContain('image');
      expect(traitNames).toContain('depth_estimation');
      expect(traitNames).toContain('displacement');
      expect(traitNames).toContain('depth_to_normal');
    }
  });

  it('should apply depth model options to traits', () => {
    const compiler = createHoloGramMLSCompiler({
      depthModel: 'depth-anything-v2-large',
      depthBackend: 'wasm',
      displacementScale: 0.5,
      displacementSegments: 256,
    });
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    const photoObj = result.composition!.objects.find((o: any) =>
      o.traits?.some((t: any) => t.name === 'depth_estimation')
    );
    const depthTrait = photoObj!.traits.find((t: any) => t.name === 'depth_estimation');
    expect(depthTrait.params.model).toBe('depth-anything-v2-large');
    expect(depthTrait.params.backend).toBe('wasm');

    const dispTrait = photoObj!.traits.find((t: any) => t.name === 'displacement');
    expect(dispTrait.params.scale).toBe(0.5);
    expect(dispTrait.params.segments).toBe(256);
  });

  it('should create a floor object per room', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    const floors = result.composition!.objects.filter((o: any) =>
      o.id?.startsWith('floor_')
    );
    expect(floors.length).toBe(3);
  });

  it('should create room labels as billboard objects', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    const labels = result.composition!.objects.filter((o: any) =>
      o.id?.startsWith('label_')
    );
    expect(labels.length).toBe(3);
    expect(labels[0].traits.some((t: any) => t.name === 'billboard')).toBe(true);
  });

  it('should include spot lights when enabled', () => {
    const compiler = createHoloGramMLSCompiler({ spotLighting: true });
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    const spots = result.composition!.lights.filter((l: any) => l.lightType === 'spot');
    expect(spots.length).toBe(3);
  });

  it('should omit spot lights when disabled', () => {
    const compiler = createHoloGramMLSCompiler({ spotLighting: false });
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    const spots = result.composition!.lights.filter((l: any) => l.lightType === 'spot');
    expect(spots.length).toBe(0);
    expect(result.stats.lights).toBe(2); // ambient + directional only
  });

  it('should create walkable waypoints for multi-room', () => {
    const compiler = createHoloGramMLSCompiler({ walkable: true });
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    expect(result.stats.waypoints).toBe(3);
    expect(result.composition!.waypointSets.length).toBe(1);
    expect(result.composition!.waypointSets[0].points.length).toBe(3);
  });

  it('should omit waypoints when walkable is false', () => {
    const compiler = createHoloGramMLSCompiler({ walkable: false });
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    expect(result.stats.waypoints).toBe(0);
    expect(result.composition!.waypointSets.length).toBe(0);
  });

  it('should handle photos without room labels', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({
      photos: [
        { url: 'https://example.com/a.jpg' },
        { url: 'https://example.com/b.jpg' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.stats.rooms).toBe(1);
    expect(result.composition!.spatialGroups[0].name).toBe('Uncategorized');
  });

  it('should handle empty bundle gracefully', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({ photos: [] });

    expect(result.success).toBe(true);
    expect(result.composition!.objects.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should include a world block with bounds', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    expect(result.composition!.worlds).toBeDefined();
    expect(result.composition!.worlds!.length).toBe(1);
    expect(result.composition!.worlds![0].bounds).toBeDefined();
  });

  it('should position camera at first room entrance', () => {
    const compiler = new HoloGramMLSCompiler({ roomSpacing: 10 });
    const result = compiler.compile({ photos: SAMPLE_PHOTOS });

    expect(result.composition!.camera).toBeDefined();
    expect(result.composition!.camera!.position.y).toBe(1.6);
  });

  it('should include property metadata in composition', () => {
    const compiler = new HoloGramMLSCompiler();
    const result = compiler.compile({
      photos: [{ url: 'https://example.com/p.jpg', room: 'Test' }],
      propertyMetadata: { listingId: '12345', agent: 'Alice' },
    });

    expect(result.composition!.metadata).toMatchObject({
      listingId: '12345',
      agent: 'Alice',
      compiler: 'hologram_mls',
    });
  });
});
