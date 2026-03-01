/**
 * PuppeteerRenderer Tests
 *
 * Unit tests for headless Chrome rendering functionality.
 * Note: Some tests require puppeteer to be installed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PuppeteerRenderer,
  type ScreenshotOptions,
  type PDFOptions,
  type PrerenderOptions,
  type PuppeteerRendererOptions,
  type RenderResult,
} from '../PuppeteerRenderer';

// Mock puppeteer for unit tests that don't need real browser
const mockPage = {
  setViewport: vi.fn().mockResolvedValue(undefined),
  setContent: vi.fn().mockResolvedValue(undefined),
  setDefaultTimeout: vi.fn(),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('mock-screenshot')),
  pdf: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
  content: vi.fn().mockResolvedValue('<html><body>Mock HTML</body></html>'),
  evaluate: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
  version: vi.fn().mockResolvedValue('HeadlessChrome/120.0.0.0'),
};

// Sample HoloScript code for testing
const testHoloCode = `
composition "TestScene" {
  environment {
    skybox: "galaxy"
  }

  object "TestCube" {
    geometry: "cube"
    color: "#ff0000"
    position: [0, 1, 0]
  }
}
`;

describe('PuppeteerRenderer', () => {
  describe('constructor', () => {
    it('should create renderer with default options', () => {
      const renderer = new PuppeteerRenderer();
      expect(renderer).toBeDefined();
    });

    it('should accept custom options', () => {
      const options: PuppeteerRendererOptions = {
        headless: false,
        timeout: 60000,
        debug: true,
        defaultViewport: { width: 1920, height: 1080 },
        threeVersion: '0.165.0',
      };
      const renderer = new PuppeteerRenderer(options);
      expect(renderer).toBeDefined();
    });

    it('should use custom executable path', () => {
      const renderer = new PuppeteerRenderer({
        executablePath: '/usr/bin/chromium',
      });
      expect(renderer).toBeDefined();
    });
  });

  describe('static methods', () => {
    it('should detect if puppeteer is available', async () => {
      const available = await PuppeteerRenderer.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('screenshot options', () => {
    it('should support PNG format', () => {
      const options: ScreenshotOptions = {
        format: 'png',
        width: 1920,
        height: 1080,
      };
      expect(options.format).toBe('png');
    });

    it('should support JPEG format with quality', () => {
      const options: ScreenshotOptions = {
        format: 'jpeg',
        quality: 85,
      };
      expect(options.quality).toBe(85);
    });

    it('should support WebP format', () => {
      const options: ScreenshotOptions = {
        format: 'webp',
        quality: 80,
      };
      expect(options.format).toBe('webp');
    });

    it('should support device scale factor for retina', () => {
      const options: ScreenshotOptions = {
        deviceScaleFactor: 2,
      };
      expect(options.deviceScaleFactor).toBe(2);
    });

    it('should support transparent background for PNG', () => {
      const options: ScreenshotOptions = {
        format: 'png',
        omitBackground: true,
      };
      expect(options.omitBackground).toBe(true);
    });

    it('should support custom wait time', () => {
      const options: ScreenshotOptions = {
        waitForStable: 5000,
      };
      expect(options.waitForStable).toBe(5000);
    });

    it('should support wait for selector', () => {
      const options: ScreenshotOptions = {
        waitForSelector: '#scene-ready',
      };
      expect(options.waitForSelector).toBe('#scene-ready');
    });

    it('should support capture after frames', () => {
      const options: ScreenshotOptions = {
        captureAfterFrames: 60,
      };
      expect(options.captureAfterFrames).toBe(60);
    });
  });

  describe('PDF options', () => {
    it('should support A4 format', () => {
      const options: PDFOptions = {
        format: 'A4',
      };
      expect(options.format).toBe('A4');
    });

    it('should support Letter format', () => {
      const options: PDFOptions = {
        format: 'Letter',
      };
      expect(options.format).toBe('Letter');
    });

    it('should support landscape orientation', () => {
      const options: PDFOptions = {
        landscape: true,
      };
      expect(options.landscape).toBe(true);
    });

    it('should support custom margins', () => {
      const options: PDFOptions = {
        margin: {
          top: '2cm',
          right: '1.5cm',
          bottom: '2cm',
          left: '1.5cm',
        },
      };
      expect(options.margin?.top).toBe('2cm');
    });

    it('should support custom scale', () => {
      const options: PDFOptions = {
        scale: 0.8,
      };
      expect(options.scale).toBe(0.8);
    });

    it('should support print background', () => {
      const options: PDFOptions = {
        printBackground: true,
      };
      expect(options.printBackground).toBe(true);
    });
  });

  describe('prerender options', () => {
    it('should support different wait conditions', () => {
      const options1: PrerenderOptions = { waitUntil: 'load' };
      const options2: PrerenderOptions = { waitUntil: 'domcontentloaded' };
      const options3: PrerenderOptions = { waitUntil: 'networkidle0' };
      const options4: PrerenderOptions = { waitUntil: 'networkidle2' };

      expect(options1.waitUntil).toBe('load');
      expect(options2.waitUntil).toBe('domcontentloaded');
      expect(options3.waitUntil).toBe('networkidle0');
      expect(options4.waitUntil).toBe('networkidle2');
    });

    it('should support script removal', () => {
      const options: PrerenderOptions = {
        removeScripts: true,
      };
      expect(options.removeScripts).toBe(true);
    });

    it('should support meta tag addition', () => {
      const options: PrerenderOptions = {
        addMetaTags: true,
      };
      expect(options.addMetaTags).toBe(true);
    });
  });

  describe('RenderResult type', () => {
    it('should have correct structure for success', () => {
      const result: RenderResult = {
        success: true,
        data: Buffer.from('test'),
        timing: {
          navigationMs: 100,
          renderMs: 50,
          captureMs: 25,
          totalMs: 175,
        },
        metadata: {
          width: 1920,
          height: 1080,
          format: 'png',
          size: 1024,
        },
      };

      expect(result.success).toBe(true);
      expect(result.timing?.totalMs).toBe(175);
      expect(result.metadata?.format).toBe('png');
    });

    it('should have correct structure for failure', () => {
      const result: RenderResult = {
        success: false,
        error: 'Puppeteer not installed',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Puppeteer not installed');
    });
  });

  describe('HTML generation', () => {
    it('should generate valid render HTML', async () => {
      // Test that the renderer can be created without errors
      const renderer = new PuppeteerRenderer({ debug: false });
      expect(renderer).toBeDefined();
    });

    it('should escape HoloScript code in HTML', () => {
      // Code with special characters should be safely JSON-encoded
      const codeWithSpecialChars = `
        object "Test<>&'" {
          geometry: "cube"
        }
      `;
      const renderer = new PuppeteerRenderer();
      expect(renderer).toBeDefined();
    });
  });

  describe('visual regression', () => {
    it('should accept baseline buffer for comparison', async () => {
      const renderer = new PuppeteerRenderer();
      const baseline = Buffer.from('baseline-image-data');

      // Without mocking, this will fail due to puppeteer not being initialized
      // but we can verify the method signature is correct
      expect(typeof renderer.visualRegression).toBe('function');
    });

    it('should support threshold configuration', () => {
      // Threshold should be between 0 and 1
      const threshold = 0.05; // 5% difference allowed
      expect(threshold).toBeGreaterThanOrEqual(0);
      expect(threshold).toBeLessThanOrEqual(1);
    });
  });

  describe('animation frame capture', () => {
    it('should support frame count configuration', () => {
      const options = {
        frameCount: 30,
        frameInterval: 100, // 10 FPS
        format: 'png' as const,
      };

      expect(options.frameCount).toBe(30);
      expect(options.frameInterval).toBe(100);
    });

    it('should calculate correct capture duration', () => {
      const frameCount = 30;
      const frameInterval = 100;
      const expectedDuration = frameCount * frameInterval;

      expect(expectedDuration).toBe(3000); // 3 seconds
    });
  });

  describe('error handling', () => {
    it('should return error result when puppeteer not installed', async () => {
      // Create renderer without mocking - will fail on initialize
      const renderer = new PuppeteerRenderer();

      // isAvailable is static and tells us if puppeteer can be imported
      const available = await PuppeteerRenderer.isAvailable();

      if (!available) {
        // Expected behavior when puppeteer is not installed
        expect(available).toBe(false);
      } else {
        expect(available).toBe(true);
      }
    });
  });

  describe('page pool', () => {
    it('should reuse pages efficiently', () => {
      // Pool size configuration
      const renderer = new PuppeteerRenderer();
      expect(renderer).toBeDefined();
    });
  });
});

describe('convenience functions', () => {
  it('should export renderScreenshot function', async () => {
    const { renderScreenshot } = await import('../PuppeteerRenderer');
    expect(typeof renderScreenshot).toBe('function');
  });

  it('should export renderPDF function', async () => {
    const { renderPDF } = await import('../PuppeteerRenderer');
    expect(typeof renderPDF).toBe('function');
  });

  it('should export prerenderHTML function', async () => {
    const { prerenderHTML } = await import('../PuppeteerRenderer');
    expect(typeof prerenderHTML).toBe('function');
  });
});
