// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTexturePaint, DEFAULT_PAINT } from '../useTexturePaint';
import * as THREE from 'three';

// Mock THREE.CanvasTexture
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof THREE>('three');
  return {
    ...actual,
    CanvasTexture: vi.fn().mockImplementation(function (canvas: HTMLCanvasElement) {
      return { canvas, needsUpdate: false };
    }),
  };
});

// Mock Canvas API
const mockGradient = {
  addColorStop: vi.fn(),
};

const mockCanvasContext = {
  fillStyle: '',
  globalCompositeOperation: 'source-over',
  globalAlpha: 1,
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  createRadialGradient: vi.fn(() => mockGradient),
};

// Track createElement calls
let createElementCalls = 0;

const createMockCanvas = () => {
  createElementCalls++;
  // Create a minimal mock canvas object (not using document.createElement)
  return {
    width: 1024,
    height: 1024,
    getContext: vi.fn(() => mockCanvasContext),
  } as any;
};

// Override document.createElement to return our mock
vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  if (tagName === 'canvas') {
    return createMockCanvas();
  }
  // For non-canvas elements, create them normally using the real DOM
  const element = global.document.implementation.createHTMLDocument().createElement(tagName);
  return element as any;
});

describe('useTexturePaint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvasContext.fillStyle = '';
    mockCanvasContext.globalCompositeOperation = 'source-over';
    mockCanvasContext.globalAlpha = 1;
    createElementCalls = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(result.current.isPainting).toBe(false);
      expect(result.current.settings).toEqual(DEFAULT_PAINT);
      expect(result.current.texture).toBeNull();
    });

    it('should provide control functions', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(typeof result.current.startPainting).toBe('function');
      expect(typeof result.current.stopPainting).toBe('function');
      expect(typeof result.current.paintAtUV).toBe('function');
      expect(typeof result.current.clearCanvas).toBe('function');
      expect(typeof result.current.updateSettings).toBe('function');
      expect(typeof result.current.ensureCanvas).toBe('function');
    });
  });

  describe('Canvas Creation', () => {
    it('should create canvas on ensureCanvas call', () => {
      const { result, rerender } = renderHook(() => useTexturePaint());

      expect(result.current.texture).toBeNull();

      act(() => {
        result.current.ensureCanvas();
      });

      // Force re-render to get updated ref value
      rerender();

      expect(document.createElement).toHaveBeenCalledWith('canvas');
      expect(result.current.texture).not.toBeNull();
    });

    it('should create canvas with correct size', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      // Canvas should be created with 1024x1024 size
      expect(mockCanvasContext.fillRect).toHaveBeenCalledWith(0, 0, 1024, 1024);
    });

    it('should fill canvas with default grey background', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      expect(mockCanvasContext.fillStyle).toBe('#888888');
      expect(mockCanvasContext.fillRect).toHaveBeenCalledWith(0, 0, 1024, 1024);
    });

    it('should create THREE.CanvasTexture', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      expect(THREE.CanvasTexture).toHaveBeenCalled();
      expect(result.current.texture).toBeDefined();
    });

    it('should not recreate canvas if already exists', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      const callsAfterFirst = createElementCalls;

      act(() => {
        result.current.ensureCanvas();
      });

      expect(createElementCalls).toBe(callsAfterFirst);
    });
  });

  describe('Start Painting', () => {
    it('should set isPainting to true', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(result.current.isPainting).toBe(false);

      act(() => {
        result.current.startPainting();
      });

      expect(result.current.isPainting).toBe(true);
    });

    it('should ensure canvas exists', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(result.current.texture).toBeNull();

      act(() => {
        result.current.startPainting();
      });

      expect(result.current.texture).not.toBeNull();
    });
  });

  describe('Stop Painting', () => {
    it('should set isPainting to false', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.startPainting();
      });

      expect(result.current.isPainting).toBe(true);

      act(() => {
        result.current.stopPainting();
      });

      expect(result.current.isPainting).toBe(false);
    });
  });

  describe('Paint at UV', () => {
    it('should not paint if canvas not initialized', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(() => {
        act(() => {
          result.current.paintAtUV(0.5, 0.5);
        });
      }).not.toThrow();

      expect(mockCanvasContext.arc).not.toHaveBeenCalled();
    });

    it('should paint at correct canvas coordinates', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      // UV (0.5, 0.5) => Canvas (512, 512) with V-flip
      expect(mockCanvasContext.arc).toHaveBeenCalledWith(
        512,
        512,
        DEFAULT_PAINT.size / 2,
        0,
        Math.PI * 2
      );
    });

    it('should flip V coordinate for WebGL convention', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      act(() => {
        result.current.paintAtUV(0, 1); // Top-left in UV
      });

      // UV (0, 1) => Canvas (0, 0) after V-flip
      expect(mockCanvasContext.arc).toHaveBeenCalledWith(
        0,
        0,
        DEFAULT_PAINT.size / 2,
        0,
        Math.PI * 2
      );
    });

    it('should apply blend mode setting', () => {
      const { result } = renderHook(() => useTexturePaint());

      let blendModeWasSet = false;
      Object.defineProperty(mockCanvasContext, 'globalCompositeOperation', {
        get() {
          return this._compositeOp || 'source-over';
        },
        set(value) {
          this._compositeOp = value;
          if (value === 'multiply') blendModeWasSet = true;
        },
        configurable: true,
      });

      act(() => {
        result.current.ensureCanvas();
        result.current.updateSettings({ blendMode: 'multiply' });
      });

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(blendModeWasSet).toBe(true);
    });

    it('should apply opacity setting', () => {
      const { result } = renderHook(() => useTexturePaint());

      let opacityWasSet = false;
      Object.defineProperty(mockCanvasContext, 'globalAlpha', {
        get() {
          return this._alpha || 1;
        },
        set(value) {
          this._alpha = value;
          if (value === 0.5) opacityWasSet = true;
        },
        configurable: true,
      });

      act(() => {
        result.current.ensureCanvas();
        result.current.updateSettings({ opacity: 0.5 });
      });

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(opacityWasSet).toBe(true);
    });

    it('should create radial gradient for soft brush', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(mockCanvasContext.createRadialGradient).toHaveBeenCalledWith(
        512,
        512,
        0,
        512,
        512,
        DEFAULT_PAINT.size / 2
      );
    });

    it('should apply gradient color stops', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
        result.current.updateSettings({ color: '#ff0000' });
      });

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(mockGradient.addColorStop).toHaveBeenCalledWith(0, '#ff0000');
      expect(mockGradient.addColorStop).toHaveBeenCalledWith(0.6, '#ff0000cc');
      expect(mockGradient.addColorStop).toHaveBeenCalledWith(1, '#ff000000');
    });

    it('should draw circle at UV coordinates', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.arc).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should reset composite operation after painting', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
        result.current.updateSettings({ blendMode: 'screen' });
      });

      mockCanvasContext.globalCompositeOperation = 'screen';

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(mockCanvasContext.globalCompositeOperation).toBe('source-over');
    });

    it('should reset global alpha after painting', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
        result.current.updateSettings({ opacity: 0.3 });
      });

      mockCanvasContext.globalAlpha = 0.3;

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(mockCanvasContext.globalAlpha).toBe(1);
    });

    it('should set needsUpdate on texture', () => {
      const { result, rerender } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      rerender();
      const texture = result.current.texture!;
      expect(texture.needsUpdate).toBe(false);

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(texture.needsUpdate).toBe(true);
    });
  });

  describe('Clear Canvas', () => {
    it('should not throw if canvas not initialized', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(() => {
        act(() => {
          result.current.clearCanvas();
        });
      }).not.toThrow();
    });

    it('should fill canvas with grey', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      vi.clearAllMocks();

      act(() => {
        result.current.clearCanvas();
      });

      expect(mockCanvasContext.fillStyle).toBe('#888888');
      expect(mockCanvasContext.fillRect).toHaveBeenCalledWith(0, 0, 1024, 1024);
    });

    it('should set needsUpdate on texture', () => {
      const { result, rerender } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      rerender();
      const texture = result.current.texture!;
      texture.needsUpdate = false;

      act(() => {
        result.current.clearCanvas();
      });

      expect(texture.needsUpdate).toBe(true);
    });
  });

  describe('Update Settings', () => {
    it('should update color setting', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.updateSettings({ color: '#00ff00' });
      });

      expect(result.current.settings.color).toBe('#00ff00');
    });

    it('should update size setting', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.updateSettings({ size: 64 });
      });

      expect(result.current.settings.size).toBe(64);
    });

    it('should update opacity setting', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.updateSettings({ opacity: 0.5 });
      });

      expect(result.current.settings.opacity).toBe(0.5);
    });

    it('should update blend mode setting', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.updateSettings({ blendMode: 'multiply' });
      });

      expect(result.current.settings.blendMode).toBe('multiply');
    });

    it('should merge settings partially', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.updateSettings({ color: '#0000ff', size: 48 });
      });

      expect(result.current.settings).toEqual({
        color: '#0000ff',
        size: 48,
        opacity: DEFAULT_PAINT.opacity,
        blendMode: DEFAULT_PAINT.blendMode,
      });
    });

    it('should preserve unmodified settings', () => {
      const { result } = renderHook(() => useTexturePaint());

      const originalOpacity = result.current.settings.opacity;

      act(() => {
        result.current.updateSettings({ color: '#ff00ff' });
      });

      expect(result.current.settings.opacity).toBe(originalOpacity);
    });
  });

  describe('Paint Settings Integration', () => {
    it('should use updated brush size', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
        result.current.updateSettings({ size: 100 });
      });

      act(() => {
        result.current.paintAtUV(0.5, 0.5);
      });

      expect(mockCanvasContext.arc).toHaveBeenCalledWith(
        512,
        512,
        50, // size / 2
        0,
        Math.PI * 2
      );
    });

    it('should use all custom settings together', () => {
      const { result } = renderHook(() => useTexturePaint());

      let blendModeWasScreen = false;
      let opacityWas06 = false;

      Object.defineProperty(mockCanvasContext, 'globalCompositeOperation', {
        get() {
          return this._compositeOp || 'source-over';
        },
        set(value) {
          this._compositeOp = value;
          if (value === 'screen') blendModeWasScreen = true;
        },
        configurable: true,
      });

      Object.defineProperty(mockCanvasContext, 'globalAlpha', {
        get() {
          return this._alpha || 1;
        },
        set(value) {
          this._alpha = value;
          if (value === 0.6) opacityWas06 = true;
        },
        configurable: true,
      });

      act(() => {
        result.current.ensureCanvas();
        result.current.updateSettings({
          color: '#ffffff',
          size: 80,
          opacity: 0.6,
          blendMode: 'screen',
        });
      });

      act(() => {
        result.current.paintAtUV(0.25, 0.75);
      });

      expect(blendModeWasScreen).toBe(true);
      expect(opacityWas06).toBe(true);
      expect(mockCanvasContext.arc).toHaveBeenCalledWith(256, 256, 40, 0, Math.PI * 2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle UV coordinates at (0, 0)', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      expect(() => {
        act(() => {
          result.current.paintAtUV(0, 0);
        });
      }).not.toThrow();
    });

    it('should handle UV coordinates at (1, 1)', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      expect(() => {
        act(() => {
          result.current.paintAtUV(1, 1);
        });
      }).not.toThrow();
    });

    it('should handle rapid paint/stop cycles', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(() => {
        act(() => {
          result.current.startPainting();
          result.current.stopPainting();
          result.current.startPainting();
          result.current.stopPainting();
        });
      }).not.toThrow();

      expect(result.current.isPainting).toBe(false);
    });

    it('should handle multiple setting updates', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(() => {
        act(() => {
          result.current.updateSettings({ color: '#ff0000' });
          result.current.updateSettings({ size: 32 });
          result.current.updateSettings({ opacity: 0.9 });
          result.current.updateSettings({ blendMode: 'multiply' });
        });
      }).not.toThrow();

      expect(result.current.settings).toEqual({
        color: '#ff0000',
        size: 32,
        opacity: 0.9,
        blendMode: 'multiply',
      });
    });

    it('should handle painting before starting', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      expect(() => {
        act(() => {
          result.current.paintAtUV(0.5, 0.5);
        });
      }).not.toThrow();
    });

    it('should handle clearing before canvas creation', () => {
      const { result } = renderHook(() => useTexturePaint());

      expect(() => {
        act(() => {
          result.current.clearCanvas();
        });
      }).not.toThrow();
    });
  });

  describe('Texture State', () => {
    it('should maintain texture reference after multiple paints', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      const initialTexture = result.current.texture;

      act(() => {
        result.current.paintAtUV(0.2, 0.2);
        result.current.paintAtUV(0.5, 0.5);
        result.current.paintAtUV(0.8, 0.8);
      });

      expect(result.current.texture).toBe(initialTexture);
    });

    it('should maintain texture reference after clear', () => {
      const { result } = renderHook(() => useTexturePaint());

      act(() => {
        result.current.ensureCanvas();
      });

      const initialTexture = result.current.texture;

      act(() => {
        result.current.clearCanvas();
      });

      expect(result.current.texture).toBe(initialTexture);
    });
  });
});
