/**
 * PropertyAnnotations Production Tests
 *
 * Tests pre-built semantic annotation factory functions.
 */

import { describe, it, expect } from 'vitest';
import {
  positionAnnotation,
  rotationAnnotation,
  scaleAnnotation,
  colorAnnotation,
  opacityAnnotation,
  toggleAnnotation,
  enumAnnotation,
  rangeAnnotation,
  textAnnotation,
  referenceAnnotation,
  massAnnotation,
  velocityAnnotation,
  frictionAnnotation,
  restitutionAnnotation,
  aiStateAnnotation,
  aiGoalAnnotation,
  emotionAnnotation,
  dialogAnnotation,
  syncPriorityAnnotation,
  ownershipAnnotation,
} from '../PropertyAnnotations';

describe('PropertyAnnotations — Production', () => {
  it('positionAnnotation defaults', () => {
    const a = positionAnnotation('transform.position');
    expect(a.propertyPath).toBe('transform.position');
    expect(a.category).toBe('spatial');
    expect(a.constraints.min).toBeDefined();
  });

  it('positionAnnotation custom unit', () => {
    const a = positionAnnotation('pos', { unit: 'pixels', min: 0, max: 1920 });
    expect(a.unit).toBe('pixels');
    expect(a.constraints.max).toBe(1920);
  });

  it('rotationAnnotation defaults', () => {
    const a = rotationAnnotation('rot');
    expect(a.category).toBe('spatial');
    expect(a.constraints).toBeDefined();
  });

  it('rotationAnnotation quaternion format', () => {
    const a = rotationAnnotation('rot', { format: 'quaternion' });
    expect(a.constraints.min).toBeDefined();
  });

  it('scaleAnnotation', () => {
    const a = scaleAnnotation('scale');
    expect(a.category).toBe('spatial');
    expect(a.constraints.min).toBeDefined();
  });

  it('colorAnnotation', () => {
    const a = colorAnnotation('color');
    expect(a.category).toBe('visual');
  });

  it('colorAnnotation with alpha', () => {
    const a = colorAnnotation('color', { includeAlpha: true });
    expect(a.category).toBe('visual');
    expect(a.editorWidget).toBe('colorAlpha');
  });

  it('opacityAnnotation', () => {
    const a = opacityAnnotation('alpha');
    expect(a.category).toBe('visual');
    expect(a.constraints.min).toBe(0);
    expect(a.constraints.max).toBe(1);
  });

  it('toggleAnnotation', () => {
    const a = toggleAnnotation('visible', 'Visible', 'visual');
    expect(a.intent).toBe('state');
    expect(a.category).toBe('visual');
  });

  it('enumAnnotation', () => {
    const a = enumAnnotation('mode', 'Mode', 'ai', ['idle', 'patrol', 'attack']);
    expect(a.constraints.allowedValues).toEqual(['idle', 'patrol', 'attack']);
  });

  it('rangeAnnotation', () => {
    const a = rangeAnnotation('health', 'Health', 'ai', { min: 0, max: 100 });
    expect(a.constraints.min).toBe(0);
    expect(a.constraints.max).toBe(100);
  });

  it('textAnnotation', () => {
    const a = textAnnotation('name', 'Name');
    expect(a.intent).toBe('state');
  });

  it('referenceAnnotation', () => {
    const a = referenceAnnotation('mesh', 'Mesh', 'mesh_asset');
    expect(a.intent).toBe('reference');
  });

  it('massAnnotation defaults', () => {
    const a = massAnnotation('mass');
    expect(a.category).toBe('physical');
    expect(a.unit).toBeDefined();
  });

  it('velocityAnnotation', () => {
    const a = velocityAnnotation('vel');
    expect(a.category).toBe('physical');
  });

  it('frictionAnnotation', () => {
    const a = frictionAnnotation('friction');
    expect(a.category).toBe('physical');
    expect(a.constraints.min).toBe(0);
    expect(a.constraints.max).toBe(1);
  });

  it('restitutionAnnotation', () => {
    const a = restitutionAnnotation('bounce');
    expect(a.category).toBe('physical');
    expect(a.constraints.min).toBe(0);
    expect(a.constraints.max).toBe(1);
  });

  it('aiStateAnnotation', () => {
    const a = aiStateAnnotation('state', ['idle', 'attack']);
    expect(a.category).toBe('ai');
    expect(a.constraints.allowedValues).toEqual(['idle', 'attack']);
  });

  it('aiGoalAnnotation', () => {
    const a = aiGoalAnnotation('goal');
    expect(a.category).toBe('ai');
  });

  it('emotionAnnotation', () => {
    const a = emotionAnnotation('mood');
    expect(a.category).toBe('ai');
    expect(a.constraints.allowedValues).toBeDefined();
  });

  it('dialogAnnotation', () => {
    const a = dialogAnnotation('speech');
    expect(a.category).toBe('narrative');
  });

  it('syncPriorityAnnotation', () => {
    const a = syncPriorityAnnotation('syncPrio');
    expect(a.category).toBe('network');
  });

  it('ownershipAnnotation', () => {
    const a = ownershipAnnotation('owner');
    expect(a.category).toBe('network');
  });
});
