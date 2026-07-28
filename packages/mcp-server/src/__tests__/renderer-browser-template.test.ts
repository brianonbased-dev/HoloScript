/**
 * Tests for generateBrowserTemplate()'s prefers-reduced-motion gate (WCAG 2.3.3).
 *
 * This is the default Three.js-based preview template. Its only animation
 * today is a fixed, gentle 0.005rad/frame rotation (no seizure risk), but the
 * gate is added here as a general accessibility default / defense-in-depth,
 * matching the same gate added to generateWebGPUBrowserTemplate().
 *
 * Server-generated HTML/JS string -- not runnable in a Node test environment,
 * so these are string-content assertions rather than a live DOM/browser test.
 */

import { describe, expect, it } from 'vitest';
import { generateBrowserTemplate } from '../renderer';

describe('generateBrowserTemplate prefers-reduced-motion gate', () => {
  const html = generateBrowserTemplate(
    'composition "Test" { object "Box" {} }',
    'Motion Gate Test'
  );

  it('detects the OS-level reduced-motion preference via matchMedia', () => {
    expect(html).toContain('matchMedia');
    expect(html).toContain('prefers-reduced-motion: reduce');
  });

  it('does not unconditionally start the animation loop', () => {
    // animate() must be reachable only through the conditional gate, not
    // called unconditionally right after being defined.
    expect(html).not.toMatch(/function render\(\) \{[\s\S]*?\}\s*\n\s*animate\(\);/);
    expect(html).toMatch(/if \(prefersReducedMotion\)/);
    expect(html).toContain('animate();');
  });

  it('renders one static frame and shows a click-to-enable control when reduced motion is on', () => {
    expect(html).toContain('motion-button');
    expect(html).toContain('Reduced motion is on');
    expect(html).toMatch(/render\(\);\s*\n\s*const motionButton/);
  });
});
