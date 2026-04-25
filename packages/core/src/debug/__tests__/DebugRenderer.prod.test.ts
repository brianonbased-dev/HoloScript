/**
 * DebugRenderer Production Tests
 *
 * Draw primitives, update expiry, queries, control.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DebugRenderer, DebugColors } from '../DebugRenderer';

describe('DebugRenderer — Production', () => {
  let dr: DebugRenderer;

  beforeEach(() => {
    dr = new DebugRenderer();
  });

  describe('draw primitives', () => {
    it('drawLine returns id', () => {
      const id = dr.drawLine([0, 0, 0], [1, 1, 1]);
      expect(id).toBeTruthy();
      expect(dr.getDrawCallCount()).toBe(1);
    });

    it('drawSphere', () => {
      dr.drawSphere([0, 0, 0], 1);
      expect(dr.getDrawCallsByType('sphere')).toHaveLength(1);
    });

    it('drawBox', () => {
      dr.drawBox([0, 0, 0], [1, 1, 1]);
      expect(dr.getDrawCallsByType('box')).toHaveLength(1);
    });

    it('drawRay', () => {
      dr.drawRay([0, 0, 0], [1, 0, 0]);
      expect(dr.getDrawCallsByType('ray')).toHaveLength(1);
    });

    it('drawArrow', () => {
      dr.drawArrow([0, 0, 0], [5, 0, 0]);
      expect(dr.getDrawCallsByType('arrow')).toHaveLength(1);
    });

    it('drawCircle', () => {
      dr.drawCircle([0, 0, 0], 2, [0, 1, 0]);
      expect(dr.getDrawCallsByType('circle')).toHaveLength(1);
    });

    it('drawText', () => {
      dr.drawText([0, 0, 0], 'Hello');
      expect(dr.getDrawCallsByType('text')).toHaveLength(1);
    });

    it('drawGrid', () => {
      dr.drawGrid([0, 0, 0], 10, 10);
      expect(dr.getDrawCallsByType('grid')).toHaveLength(1);
    });
  });

  describe('update expiry', () => {
    it('single-frame calls removed after update', () => {
      dr.drawLine([0, 0, 0], [1, 1, 1], DebugColors.green, 0);
      expect(dr.getDrawCallCount()).toBe(1);
      dr.update(0.016);
      expect(dr.getDrawCallCount()).toBe(0);
    });

    it('timed calls persist then expire', () => {
      dr.drawSphere([0, 0, 0], 1, DebugColors.red, 1.0);
      dr.update(0.5);
      expect(dr.getDrawCallCount()).toBe(1);
      dr.update(0.6);
      expect(dr.getDrawCallCount()).toBe(0);
    });
  });

  describe('removeDraw', () => {
    it('removes by id', () => {
      const id = dr.drawLine([0, 0, 0], [1, 1, 1], DebugColors.green, 5);
      expect(dr.removeDraw(id)).toBe(true);
      expect(dr.getDrawCallCount()).toBe(0);
    });
  });

  describe('control', () => {
    it('disabled produces no draw calls', () => {
      dr.setEnabled(false);
      expect(dr.isEnabled()).toBe(false);
      dr.drawLine([0, 0, 0], [1, 1, 1]);
      expect(dr.getDrawCallCount()).toBe(0);
    });

    it('clear removes all', () => {
      dr.drawLine([0, 0, 0], [1, 1, 1], DebugColors.green, 5);
      dr.drawSphere([0, 0, 0], 1, DebugColors.red, 5);
      dr.clear();
      expect(dr.getDrawCallCount()).toBe(0);
    });
  });
});
