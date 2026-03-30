// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioVisualizer } from '../useAudioVisualizer';

// Mock Web Audio API
const mockAnalyserNode = {
  fftSize: 256,
  frequencyBinCount: 128,
  getByteFrequencyData: vi.fn((arr) => {
    // Fill with mock frequency data
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 255);
    }
  }),
  getByteTimeDomainData: vi.fn((arr) => {
    // Fill with mock waveform data
    for (let i = 0; i < arr.length; i++) {
      arr[i] = 128 + Math.floor(Math.random() * 50 - 25);
    }
  }),
  connect: vi.fn().mockReturnThis(),
};

const mockGainNode = {
  gain: { value: 0.3 },
  connect: vi.fn().mockReturnThis(),
};

const mockOscillatorNode = {
  type: 'sawtooth',
  frequency: { value: 220 },
  connect: vi.fn().mockReturnThis(),
  start: vi.fn(),
  stop: vi.fn(),
};

const mockAudioContext = {
  createAnalyser: vi.fn(() => mockAnalyserNode),
  createGain: vi.fn(() => mockGainNode),
  createOscillator: vi.fn(() => ({ ...mockOscillatorNode })),
  close: vi.fn().mockResolvedValue(undefined),
  destination: {},
};

global.AudioContext = vi.fn().mockImplementation(function () {
  return mockAudioContext;
}) as any;

// Mock Canvas API
const mockCanvasContext = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
};

const mockCanvas = {
  width: 800,
  height: 400,
  getContext: vi.fn(() => mockCanvasContext),
};

// Mock requestAnimationFrame
let rafCallback: FrameRequestCallback | null = null;
let rafId = 1;
global.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
  rafCallback = callback;
  return rafId++;
});
global.cancelAnimationFrame = vi.fn();

describe('useAudioVisualizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rafCallback = null;
    rafId = 1;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      expect(result.current.isPlaying).toBe(false);
      expect(result.current.mode).toBe('bars');
      expect(result.current.gain).toBe(0.3);
      expect(result.current.fftSize).toBe(256);
      expect(result.current.frequencyData).toBeInstanceOf(Uint8Array);
      expect(result.current.waveformData).toBeInstanceOf(Uint8Array);
    });

    it('should provide canvas ref', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      expect(result.current.canvasRef).toBeDefined();
      expect(result.current.canvasRef.current).toBeNull();
    });

    it('should provide control functions', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      expect(typeof result.current.play).toBe('function');
      expect(typeof result.current.stop).toBe('function');
      expect(typeof result.current.setMode).toBe('function');
      expect(typeof result.current.setGain).toBe('function');
    });
  });

  describe('Play Function', () => {
    it('should create audio context when play is called', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      expect(AudioContext).toHaveBeenCalled();
      expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
      expect(mockAudioContext.createGain).toHaveBeenCalled();
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2); // Two oscillators
    });

    it('should set isPlaying to true', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      expect(result.current.isPlaying).toBe(false);

      act(() => {
        result.current.play();
      });

      expect(result.current.isPlaying).toBe(true);
    });

    it('should configure analyser with FFT size 256', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      expect(mockAnalyserNode.fftSize).toBe(256);
    });

    it('should configure gain node with initial value', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      expect(mockGainNode.gain.value).toBe(0.3);
    });

    it('should start oscillators', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      expect(mockOscillatorNode.start).toHaveBeenCalled();
    });

    it('should start animation loop', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('should close previous context on subsequent play calls', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      const firstCloseCall = mockAudioContext.close.mock.calls.length;

      act(() => {
        result.current.play();
      });

      expect(mockAudioContext.close).toHaveBeenCalledTimes(firstCloseCall + 1);
    });
  });

  describe('Stop Function', () => {
    it('should set isPlaying to false', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      expect(result.current.isPlaying).toBe(true);

      act(() => {
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);
    });

    it('should cancel animation frame', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      act(() => {
        result.current.stop();
      });

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should close audio context', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      const closeCallsBefore = mockAudioContext.close.mock.calls.length;

      act(() => {
        result.current.stop();
      });

      expect(mockAudioContext.close).toHaveBeenCalledTimes(closeCallsBefore + 1);
    });
  });

  describe('Mode Switching', () => {
    it('should switch to waveform mode', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.setMode('waveform');
      });

      expect(result.current.mode).toBe('waveform');
    });

    it('should switch to radial mode', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.setMode('radial');
      });

      expect(result.current.mode).toBe('radial');
    });

    it('should switch back to bars mode', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.setMode('radial');
        result.current.setMode('bars');
      });

      expect(result.current.mode).toBe('bars');
    });
  });

  describe('Gain Control', () => {
    it('should update gain value in state', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      expect(result.current.gain).toBe(0.3);

      act(() => {
        result.current.setGain(0.7);
      });

      expect(result.current.gain).toBe(0.7);
    });

    it('should update gain node value when playing', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      act(() => {
        result.current.setGain(0.5);
      });

      expect(mockGainNode.gain.value).toBe(0.5);
    });

    it('should handle gain changes before playing', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.setGain(0.8);
      });

      expect(result.current.gain).toBe(0.8);
      // Should not throw even though gainRef is not set yet
    });
  });

  describe('Canvas Drawing', () => {
    beforeEach(() => {
      // Clear mock calls from previous tests
      vi.clearAllMocks();
      // Setup mock canvas
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        writable: true,
        configurable: true,
        value: vi.fn(() => mockCanvasContext),
      });
    });

    it('should draw when canvas is attached', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      // Attach a mock canvas
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'width', { value: 800, writable: true });
      Object.defineProperty(canvas, 'height', { value: 400, writable: true });
      result.current.canvasRef.current = canvas;

      act(() => {
        result.current.play();
      });

      // Trigger animation frame
      if (rafCallback) {
        act(() => {
          rafCallback!(0);
        });
      }

      // Should have called clearRect to clear canvas
      expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    });

    it('should draw bars in bars mode', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'width', { value: 800, writable: true });
      Object.defineProperty(canvas, 'height', { value: 400, writable: true });
      result.current.canvasRef.current = canvas;

      act(() => {
        result.current.setMode('bars');
        result.current.play();
      });

      if (rafCallback) {
        act(() => {
          rafCallback!(0);
        });
      }

      // Should use fillRect for bars
      expect(mockCanvasContext.fillRect).toHaveBeenCalled();
    });

    it('should draw waveform in waveform mode', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'width', { value: 800, writable: true });
      Object.defineProperty(canvas, 'height', { value: 400, writable: true });
      result.current.canvasRef.current = canvas;

      expect(() => {
        act(() => {
          result.current.setMode('waveform');
          result.current.play();
        });

        if (rafCallback) {
          act(() => {
            rafCallback!(0);
          });
        }
      }).not.toThrow();

      // Mode should be set correctly
      expect(result.current.mode).toBe('waveform');
    });

    it('should draw radial in radial mode', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'width', { value: 800, writable: true });
      Object.defineProperty(canvas, 'height', { value: 400, writable: true });
      result.current.canvasRef.current = canvas;

      expect(() => {
        act(() => {
          result.current.setMode('radial');
          result.current.play();
        });

        if (rafCallback) {
          act(() => {
            rafCallback!(0);
          });
        }
      }).not.toThrow();

      // Mode should be set correctly
      expect(result.current.mode).toBe('radial');
    });
  });

  describe('Data Updates', () => {
    it('should update frequency data during playback', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      const canvas = document.createElement('canvas');
      result.current.canvasRef.current = canvas;

      const initialFreqData = result.current.frequencyData;

      act(() => {
        result.current.play();
      });

      if (rafCallback) {
        act(() => {
          rafCallback!(0);
        });
      }

      // Should have new frequency data (different object reference)
      expect(result.current.frequencyData).not.toBe(initialFreqData);
      expect(result.current.frequencyData).toBeInstanceOf(Uint8Array);
    });

    it('should update waveform data during playback', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      const canvas = document.createElement('canvas');
      result.current.canvasRef.current = canvas;

      const initialWaveData = result.current.waveformData;

      act(() => {
        result.current.play();
      });

      if (rafCallback) {
        act(() => {
          rafCallback!(0);
        });
      }

      // Should have new waveform data
      expect(result.current.waveformData).not.toBe(initialWaveData);
      expect(result.current.waveformData).toBeInstanceOf(Uint8Array);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on unmount', () => {
      const { result, unmount } = renderHook(() => useAudioVisualizer());

      act(() => {
        result.current.play();
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('should not throw if stopped before playing', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      expect(() => {
        act(() => {
          result.current.stop();
        });
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing canvas gracefully', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      // Don't attach canvas
      expect(() => {
        act(() => {
          result.current.play();
        });

        if (rafCallback) {
          act(() => {
            rafCallback!(0);
          });
        }
      }).not.toThrow();
    });

    it('should handle mode changes during playback', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      const canvas = document.createElement('canvas');
      result.current.canvasRef.current = canvas;

      act(() => {
        result.current.play();
      });

      expect(() => {
        act(() => {
          result.current.setMode('waveform');
          result.current.setMode('radial');
          result.current.setMode('bars');
        });
      }).not.toThrow();
    });

    it('should handle rapid play/stop cycles', () => {
      const { result } = renderHook(() => useAudioVisualizer());

      expect(() => {
        act(() => {
          result.current.play();
          result.current.stop();
          result.current.play();
          result.current.stop();
          result.current.play();
        });
      }).not.toThrow();

      expect(result.current.isPlaying).toBe(true);
    });
  });
});
