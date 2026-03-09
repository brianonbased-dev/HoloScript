/**
 * SubtitleRenderer Unit Tests
 *
 * Tests subtitle queuing, activation, expiration,
 * styling, formatting, history, and max visible limit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubtitleRenderer } from '../SubtitleRenderer';

describe('SubtitleRenderer', () => {
  let renderer: SubtitleRenderer;

  beforeEach(() => {
    renderer = new SubtitleRenderer();
  });

  describe('configuration', () => {
    it('should have default style', () => {
      const style = renderer.getStyle();
      expect(style.fontSize).toBe(24);
      expect(style.position).toBe('bottom');
    });

    it('should accept partial style overrides', () => {
      renderer.setStyle({ fontSize: 32, fontColor: '#FF0000' });
      const style = renderer.getStyle();
      expect(style.fontSize).toBe(32);
      expect(style.fontColor).toBe('#FF0000');
      expect(style.position).toBe('bottom'); // unchanged
    });
  });

  describe('add and update', () => {
    it('should add subtitle and activate on update', () => {
      renderer.add('Hello', 2);
      // After update(0) elapsed matches startTime=0 → entry moves from queue to active
      const active = renderer.update(0);
      expect(active.length).toBe(1);
      expect(active[0].text).toBe('Hello');
    });

    it('should expire subtitle after duration', () => {
      renderer.add('Temp', 1);
      renderer.update(0); // activate
      expect(renderer.getActiveSubtitles().length).toBe(1);

      renderer.update(1.5); // elapsed > duration
      expect(renderer.getActiveSubtitles().length).toBe(0);
    });

    it('should add to history after expiration', () => {
      renderer.add('Old', 1);
      renderer.update(0);
      renderer.update(1.5);
      expect(renderer.getHistory().length).toBe(1);
      expect(renderer.getHistory()[0].text).toBe('Old');
    });

    it('should respect maxVisible', () => {
      renderer.setMaxVisible(2);
      renderer.add('A', 5);
      renderer.add('B', 5);
      renderer.add('C', 5);
      renderer.update(0);
      expect(renderer.getActiveSubtitles().length).toBe(2);
    });
  });

  describe('timed subtitles', () => {
    it('should activate at specified start time', () => {
      renderer.addTimed('Later', 2, 3);
      renderer.update(1); // elapsed=1, not yet
      expect(renderer.getActiveSubtitles().length).toBe(0);
      renderer.update(1.5); // elapsed=2.5, should activate
      expect(renderer.getActiveSubtitles().length).toBe(1);
    });
  });

  describe('formatting', () => {
    it('should format with speaker label', () => {
      const entry = renderer.add('I am here', 5, 'Alice');
      const text = renderer.getFormattedText(entry);
      expect(text).toBe('[Alice] I am here');
    });

    it('should format without speaker', () => {
      const entry = renderer.add('Just text', 5);
      expect(renderer.getFormattedText(entry)).toBe('Just text');
    });
  });

  describe('priority sorting', () => {
    it('should sort queued items by priority (highest first)', () => {
      renderer.add('Low', 5, undefined, undefined, 1);
      renderer.add('High', 5, undefined, undefined, 10);
      // After update, higher priority should be first
      const active = renderer.update(0);
      expect(active[0].text).toBe('High');
    });
  });

  describe('clear', () => {
    it('should clear queue and active', () => {
      renderer.add('A', 5);
      renderer.update(0);
      renderer.clear();
      expect(renderer.getActiveSubtitles()).toEqual([]);
      expect(renderer.getQueueLength()).toBe(0);
    });
  });
});
