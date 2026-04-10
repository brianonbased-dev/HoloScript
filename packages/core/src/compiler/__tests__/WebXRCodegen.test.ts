/**
 * WebXR Browser Codegen Tests (M.010.19)
 *
 * Tests that PhoneSleeveVRCompiler generates correct WebXR HTML+JS
 * when compositions include webxr_* traits.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhoneSleeveVRCompiler } from '../PhoneSleeveVRCompiler';
import { WEBXR_TRAITS } from '../../traits/constants/webxr';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makeWebXRComposition(
  traits: string[],
  extraObjects: Partial<HoloComposition> = {}
): HoloComposition {
  return makeComposition({
    objects: [
      {
        name: 'Cube',
        properties: [
          { key: 'shape', value: 'cube' },
          { key: 'position', value: [0, 1, -2] },
          { key: 'color', value: '#ff4488' },
        ],
        traits: traits.map((t) => ({ name: t, args: [] })),
      } as any,
    ],
    ...extraObjects,
  });
}

describe('WebXR Browser Codegen (M.010.19)', () => {
  let compiler: PhoneSleeveVRCompiler;

  beforeEach(() => {
    compiler = new PhoneSleeveVRCompiler();
  });

  // =========== Trait detection ===========

  describe('hasWebXRTraits', () => {
    it('returns false for composition without webxr traits', () => {
      const comp = makeComposition();
      expect(compiler.hasWebXRTraits(comp)).toBe(false);
    });

    it('returns true when any webxr trait is present', () => {
      for (const trait of WEBXR_TRAITS) {
        const comp = makeWebXRComposition([trait]);
        expect(compiler.hasWebXRTraits(comp)).toBe(true);
      }
    });

    it('detects string-form traits', () => {
      const comp = makeComposition({
        objects: [
          {
            name: 'Obj',
            properties: [],
            traits: ['webxr_session'],
          } as any,
        ],
      });
      expect(compiler.hasWebXRTraits(comp)).toBe(true);
    });

    it('returns false for non-webxr traits', () => {
      const comp = makeComposition({
        objects: [
          {
            name: 'Obj',
            properties: [],
            traits: [{ name: 'geo_anchor', args: [] }],
          } as any,
        ],
      });
      expect(compiler.hasWebXRTraits(comp)).toBe(false);
    });
  });

  // =========== compile() routing ===========

  describe('compile routing', () => {
    it('returns WebXR HTML when webxr traits present', () => {
      const comp = makeWebXRComposition(['webxr_session']);
      const html = compiler.compile(comp, 'test-token');
      expect(html).toContain('renderer.xr.enabled = true');
      expect(html).toContain('navigator.xr');
    });

    it('returns Phone Sleeve VR HTML when no webxr traits', () => {
      const comp = makeComposition();
      const html = compiler.compile(comp, 'test-token');
      expect(html).toContain('StereoEffect');
      expect(html).not.toContain('renderer.xr.enabled');
    });
  });

  // =========== HTML structure ===========

  describe('WebXR HTML output', () => {
    it('generates valid HTML document', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
      expect(html).toContain('<title>TestScene</title>');
    });

    it('includes Three.js import map', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain('importmap');
      expect(html).toContain('three');
    });

    it('enables renderer.xr', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain('renderer.xr.enabled = true');
    });

    it('includes scene objects from composition', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain('BoxGeometry');
      expect(html).toContain("mesh.name = 'Cube'");
    });

    it('has transparent alpha renderer for AR', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain('alpha: true');
    });
  });

  // =========== Session types ===========

  describe('webxr_session', () => {
    it('requests immersive-ar session', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain("'immersive-ar'");
    });
  });

  describe('webxr_inline', () => {
    it('requests inline session when only inline trait present', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_inline']), 'test-token');
      expect(html).toContain("'inline'");
    });

    it('prefers immersive-ar when both session and inline present', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_inline']),
        'test-token'
      );
      expect(html).toContain("'immersive-ar'");
    });
  });

  // =========== Feature traits ===========

  describe('webxr_hit_test', () => {
    it('emits hit test source setup', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_hit_test']),
        'test-token'
      );
      expect(html).toContain('requestHitTestSource');
      expect(html).toContain('getHitTestResults');
    });

    it('includes hit-test in requiredFeatures', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_hit_test']),
        'test-token'
      );
      expect(html).toContain("'hit-test'");
    });

    it('creates reticle mesh for surface visualization', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_hit_test']),
        'test-token'
      );
      expect(html).toContain('RingGeometry');
      expect(html).toContain('reticle');
    });
  });

  describe('webxr_anchors', () => {
    it('emits createAnchor function', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_anchors']),
        'test-token'
      );
      expect(html).toContain('createAnchor');
      expect(html).toContain("'anchors'");
    });
  });

  describe('webxr_light_estimation', () => {
    it('emits light probe and estimation update', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_light_estimation']),
        'test-token'
      );
      expect(html).toContain('requestLightProbe');
      expect(html).toContain('getLightEstimate');
      expect(html).toContain("'light-estimation'");
    });

    it('creates estimated DirectionalLight', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_light_estimation']),
        'test-token'
      );
      expect(html).toContain('estimatedLight');
      expect(html).toContain('DirectionalLight');
    });
  });

  describe('webxr_dom_overlay', () => {
    it('includes dom-overlay in session options', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_dom_overlay']),
        'test-token'
      );
      expect(html).toContain("'dom-overlay'");
      expect(html).toContain("domOverlay: { root: document.getElementById('overlay') }");
    });

    it('has overlay div in HTML', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_dom_overlay']),
        'test-token'
      );
      expect(html).toContain('id="overlay"');
    });
  });

  describe('webxr_depth_sensing', () => {
    it('emits depth information access per frame', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_depth_sensing']),
        'test-token'
      );
      expect(html).toContain('getDepthInformation');
      expect(html).toContain("'depth-sensing'");
    });

    it('includes depthSensing config in session options', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_depth_sensing']),
        'test-token'
      );
      expect(html).toContain('depthSensing:');
      expect(html).toContain('usagePreference');
    });
  });

  describe('webxr_hand_tracking', () => {
    it('emits hand tracking update function', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_hand_tracking']),
        'test-token'
      );
      expect(html).toContain('updateHands');
      expect(html).toContain('getJointPose');
      expect(html).toContain("'hand-tracking'");
    });

    it('iterates XRHand joint spaces', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_hand_tracking']),
        'test-token'
      );
      expect(html).toContain('source.hand');
      expect(html).toContain('jointSpace');
    });
  });

  describe('webxr_layers', () => {
    it('includes layers in requiredFeatures', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_layers']),
        'test-token'
      );
      expect(html).toContain("'layers'");
      expect(html).toContain('xrProjectionLayer');
    });
  });

  describe('webxr_framebuffer', () => {
    it('declares framebuffer variable for custom rendering', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_framebuffer']),
        'test-token'
      );
      expect(html).toContain('xrFramebuffer');
    });
  });

  describe('webxr_reference_space', () => {
    it('uses local-floor reference space when trait present', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_reference_space']),
        'test-token'
      );
      expect(html).toContain("'local-floor'");
    });

    it('defaults to local reference space without trait', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain("requestReferenceSpace('local')");
    });
  });

  // =========== Combined traits ===========

  describe('multiple traits combined', () => {
    it('generates all features when all traits present', () => {
      const allTraits = [...WEBXR_TRAITS];
      const html = compiler.compile(makeWebXRComposition(allTraits), 'test-token');

      // Session
      expect(html).toContain("'immersive-ar'");

      // Features
      expect(html).toContain('requestHitTestSource');
      expect(html).toContain('createAnchor');
      expect(html).toContain('requestLightProbe');
      expect(html).toContain('getDepthInformation');
      expect(html).toContain('updateHands');

      // Required features array
      expect(html).toContain("'hit-test'");
      expect(html).toContain("'anchors'");
      expect(html).toContain("'light-estimation'");
      expect(html).toContain("'dom-overlay'");
      expect(html).toContain("'depth-sensing'");
      expect(html).toContain("'hand-tracking'");
      expect(html).toContain("'layers'");
    });

    it('generates single self-contained HTML file', () => {
      const html = compiler.compile(
        makeWebXRComposition(['webxr_session', 'webxr_hit_test', 'webxr_anchors']),
        'test-token'
      );
      // Starts with doctype, ends with </html> — single file
      expect(html.trim()).toMatch(/^<!DOCTYPE html>/);
      expect(html.trim()).toMatch(/<\/html>$/);
      // No external script srcs beyond CDN
      expect(html).not.toContain('src="./');
      expect(html).not.toContain("src='./");
    });
  });

  // =========== Error handling ===========

  describe('XR error handling', () => {
    it('includes fallback for unsupported browsers', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain('WebXR not supported');
      expect(html).toContain('navigator.xr');
    });

    it('includes session end cleanup', () => {
      const html = compiler.compile(makeWebXRComposition(['webxr_session']), 'test-token');
      expect(html).toContain("addEventListener('end'");
    });
  });
});
