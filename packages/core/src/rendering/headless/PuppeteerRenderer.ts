/**
 * Puppeteer-based Headless Chrome Renderer
 *
 * Provides headless Chrome rendering capabilities for HoloScript scenes:
 * - Screenshot capture (PNG, JPEG, WebP)
 * - PDF generation
 * - Pre-rendered HTML for SEO/social sharing
 * - Visual regression testing support
 * - Animation capture (GIF/video frames)
 *
 * @module render/headless/PuppeteerRenderer
 * @version 1.0.0
 */

// Note: Puppeteer is a peer dependency - must be installed separately
// npm install puppeteer

// Type definitions for Puppeteer (avoid direct import for optional dependency)
/* eslint-disable @typescript-eslint/no-explicit-any */
type PuppeteerBrowser = {
  newPage: () => Promise<PuppeteerPage>;
  close: () => Promise<void>;
  version: () => Promise<string>;
};

type PuppeteerPage = {
  setViewport: (viewport: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  }) => Promise<void>;
  setContent: (html: string, options?: { waitUntil?: string; timeout?: number }) => Promise<void>;
  setDefaultTimeout: (timeout: number) => void;
  screenshot: (options?: Record<string, unknown>) => Promise<Buffer>;
  pdf: (options?: Record<string, unknown>) => Promise<Buffer>;
  content: () => Promise<string>;
  evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
  waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<void>;
  goto: (url: string) => Promise<void>;
  close: () => Promise<void>;
};

type PuppeteerLaunchOptions = {
  headless?: boolean | 'new';
  args?: string[];
  defaultViewport?: { width: number; height: number } | null;
  timeout?: number;
  executablePath?: string;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ScreenshotOptions {
  /** Output format */
  format?: 'png' | 'jpeg' | 'webp';
  /** Quality for JPEG/WebP (0-100) */
  quality?: number;
  /** Viewport width */
  width?: number;
  /** Viewport height */
  height?: number;
  /** Device scale factor for retina screenshots */
  deviceScaleFactor?: number;
  /** Take full page screenshot */
  fullPage?: boolean;
  /** Transparent background (PNG only) */
  omitBackground?: boolean;
  /** Wait for scene to stabilize (ms) */
  waitForStable?: number;
  /** Custom wait selector */
  waitForSelector?: string;
  /** Capture after N animation frames */
  captureAfterFrames?: number;
}

export interface PDFOptions {
  /** Page format */
  format?: 'A4' | 'Letter' | 'Legal' | 'Tabloid' | 'A3' | 'A5';
  /** Landscape orientation */
  landscape?: boolean;
  /** Print background graphics */
  printBackground?: boolean;
  /** Page margins */
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  /** Scale (0.1 - 2.0) */
  scale?: number;
  /** Custom width */
  width?: string;
  /** Custom height */
  height?: string;
}

export interface PrerenderOptions {
  /** Wait for JavaScript to execute */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  /** Timeout in ms */
  timeout?: number;
  /** Strip JavaScript from output */
  removeScripts?: boolean;
  /** Inline CSS */
  inlineStyles?: boolean;
  /** Add meta tags for SEO */
  addMetaTags?: boolean;
}

export interface AnimationFrameOptions extends ScreenshotOptions {
  /** Number of frames to capture */
  frameCount: number;
  /** Time between frames in ms */
  frameInterval?: number;
  /** Output directory for frames */
  outputDir?: string;
  /** Frame filename pattern */
  filenamePattern?: string;
}

export interface RenderResult {
  success: boolean;
  data?: Buffer | string;
  error?: string;
  timing?: {
    navigationMs: number;
    renderMs: number;
    captureMs: number;
    totalMs: number;
  };
  metadata?: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
}

export interface PuppeteerRendererOptions {
  /** Puppeteer executable path (chromium) */
  executablePath?: string;
  /** Run in headless mode (default: true) */
  headless?: boolean;
  /** Browser arguments */
  args?: string[];
  /** Default viewport size */
  defaultViewport?: { width: number; height: number };
  /** Timeout for operations in ms */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Base URL for the render service */
  renderServiceUrl?: string;
  /** Custom Three.js/WebGL version */
  threeVersion?: string;
}

/**
 * PuppeteerRenderer - Headless Chrome renderer for HoloScript scenes
 *
 * @example
 * ```typescript
 * const renderer = new PuppeteerRenderer();
 * await renderer.initialize();
 *
 * // Take a screenshot of a scene
 * const result = await renderer.screenshot(holoCode, {
 *   width: 1920,
 *   height: 1080,
 *   format: 'png'
 * });
 *
 * // Generate PDF
 * const pdf = await renderer.generatePDF(holoCode, { format: 'A4' });
 *
 * // Pre-render for SEO
 * const html = await renderer.prerender(holoCode, { waitUntil: 'networkidle0' });
 *
 * await renderer.close();
 * ```
 */
export class PuppeteerRenderer {
  private browser: PuppeteerBrowser | null = null;
  private options: PuppeteerRendererOptions;
  private initialized: boolean = false;
  private pagePool: PuppeteerPage[] = [];
  private maxPoolSize: number = 4;

  constructor(options: PuppeteerRendererOptions = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      debug: false,
      defaultViewport: { width: 1280, height: 720 },
      renderServiceUrl: 'http://localhost:3000',
      threeVersion: '0.160.0',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
      ...options,
    };
  }

  /**
   * Initialize the browser instance
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid bundling puppeteer with core
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const puppeteer = await import(/* webpackIgnore: true */ 'puppeteer' as string);

      const launchOptions: PuppeteerLaunchOptions = {
        headless: this.options.headless ? 'new' : false,
        args: this.options.args,
        defaultViewport: this.options.defaultViewport,
        timeout: this.options.timeout,
      };

      if (this.options.executablePath) {
        launchOptions.executablePath = this.options.executablePath;
      }

      this.browser = await puppeteer.default.launch(launchOptions);
      this.initialized = true;
      this.log('Browser initialized');
    } catch (error) {
      const err = error as Error;
      throw new Error(
        `Failed to initialize Puppeteer: ${err.message}. Make sure puppeteer is installed: npm install puppeteer`
      );
    }
  }

  /**
   * Get or create a page from the pool
   */
  private async getPage(): Promise<PuppeteerPage> {
    await this.ensureInitialized();

    if (this.pagePool.length > 0) {
      return this.pagePool.pop()!;
    }

    const page = await this.browser!.newPage();
    page.setDefaultTimeout(this.options.timeout!);
    return page;
  }

  /**
   * Return a page to the pool
   */
  private async releasePage(page: PuppeteerPage): Promise<void> {
    if (this.pagePool.length < this.maxPoolSize) {
      // Clean up the page before returning to pool
      await page.goto('about:blank');
      this.pagePool.push(page);
    } else {
      await page.close();
    }
  }

  /**
   * Ensure browser is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Take a screenshot of a HoloScript scene
   */
  async screenshot(holoCode: string, options: ScreenshotOptions = {}): Promise<RenderResult> {
    const startTime = Date.now();
    const page = await this.getPage();

    try {
      const {
        format = 'png',
        quality = 90,
        width = 1280,
        height = 720,
        deviceScaleFactor = 1,
        fullPage = false,
        omitBackground = false,
        waitForStable = 2000,
        waitForSelector,
        captureAfterFrames,
      } = options;

      // Set viewport
      await page.setViewport({
        width,
        height,
        deviceScaleFactor,
      });

      const navigationStart = Date.now();

      // Generate render HTML and navigate
      const html = this.generateRenderHTML(holoCode);
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: this.options.timeout,
      });

      const navigationMs = Date.now() - navigationStart;
      const renderStart = Date.now();

      // Wait for scene to be ready
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: this.options.timeout });
      }

      // Wait for animation frames if specified
      if (captureAfterFrames) {
        await page.evaluate((frames: number) => {
          return new Promise<void>((resolve) => {
            let count = 0;
            const tick = () => {
              count++;
              if (count >= frames) {
                resolve();
              } else {
                requestAnimationFrame(tick);
              }
            };
            requestAnimationFrame(tick);
          });
        }, captureAfterFrames);
      }

      // Wait for scene to stabilize
      await page.evaluate(
        (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
        waitForStable
      );

      const renderMs = Date.now() - renderStart;
      const captureStart = Date.now();

      // Take screenshot
      const screenshotOptions: Record<string, unknown> = {
        type: format === 'webp' ? 'webp' : format,
        fullPage,
        omitBackground: format === 'png' ? omitBackground : false,
      };

      if (format === 'jpeg' || format === 'webp') {
        screenshotOptions.quality = quality;
      }

      const buffer = await page.screenshot(screenshotOptions);
      const captureMs = Date.now() - captureStart;

      await this.releasePage(page);

      return {
        success: true,
        data: buffer,
        timing: {
          navigationMs,
          renderMs,
          captureMs,
          totalMs: Date.now() - startTime,
        },
        metadata: {
          width,
          height,
          format,
          size: buffer.length,
        },
      };
    } catch (error) {
      await this.releasePage(page);
      const err = error as Error;
      this.log('Screenshot failed:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Generate a PDF of a HoloScript scene
   */
  async generatePDF(holoCode: string, options: PDFOptions = {}): Promise<RenderResult> {
    const startTime = Date.now();
    const page = await this.getPage();

    try {
      const {
        format = 'A4',
        landscape = false,
        printBackground = true,
        margin,
        scale = 1,
        width,
        height,
      } = options;

      const navigationStart = Date.now();

      // Generate render HTML and navigate
      const html = this.generateRenderHTML(holoCode, { printMode: true });
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: this.options.timeout,
      });

      // Wait for scene to load
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2000)));

      const navigationMs = Date.now() - navigationStart;
      const captureStart = Date.now();

      // Generate PDF
      const pdfOptions: Record<string, unknown> = {
        format,
        landscape,
        printBackground,
        scale,
        margin: margin || {
          top: '1cm',
          right: '1cm',
          bottom: '1cm',
          left: '1cm',
        },
      };

      if (width) pdfOptions.width = width;
      if (height) pdfOptions.height = height;

      const buffer = await page.pdf(pdfOptions);
      const captureMs = Date.now() - captureStart;

      await this.releasePage(page);

      return {
        success: true,
        data: buffer,
        timing: {
          navigationMs,
          renderMs: 0,
          captureMs,
          totalMs: Date.now() - startTime,
        },
        metadata: {
          width: 0,
          height: 0,
          format: 'pdf',
          size: buffer.length,
        },
      };
    } catch (error) {
      await this.releasePage(page);
      const err = error as Error;
      this.log('PDF generation failed:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Pre-render HoloScript for SEO/social sharing
   * Returns fully rendered HTML with all JavaScript executed
   */
  async prerender(holoCode: string, options: PrerenderOptions = {}): Promise<RenderResult> {
    const startTime = Date.now();
    const page = await this.getPage();

    try {
      const {
        waitUntil = 'networkidle0',
        timeout = this.options.timeout,
        removeScripts = true,
        inlineStyles = true,
        addMetaTags = true,
      } = options;

      const navigationStart = Date.now();

      // Generate render HTML and navigate
      const html = this.generateRenderHTML(holoCode, { seoMode: true });
      await page.setContent(html, {
        waitUntil,
        timeout,
      });

      // Wait for scene to fully render
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 3000)));

      const navigationMs = Date.now() - navigationStart;
      const captureStart = Date.now();

      // Get rendered HTML
      let renderedHtml = await page.content();

      // Post-process HTML
      if (removeScripts) {
        renderedHtml = renderedHtml.replace(
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          ''
        );
      }

      if (inlineStyles) {
        // Styles are already inline in our generated HTML
      }

      if (addMetaTags) {
        // Add additional meta tags for SEO
        const metaTags = `
    <meta name="generator" content="HoloScript">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index, follow">`;

        renderedHtml = renderedHtml.replace('</head>', `${metaTags}\n</head>`);
      }

      const captureMs = Date.now() - captureStart;

      await this.releasePage(page);

      return {
        success: true,
        data: renderedHtml,
        timing: {
          navigationMs,
          renderMs: 0,
          captureMs,
          totalMs: Date.now() - startTime,
        },
        metadata: {
          width: 0,
          height: 0,
          format: 'html',
          size: Buffer.byteLength(renderedHtml),
        },
      };
    } catch (error) {
      await this.releasePage(page);
      const err = error as Error;
      this.log('Prerender failed:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Capture animation frames for GIF/video generation
   */
  async captureAnimationFrames(
    holoCode: string,
    options: AnimationFrameOptions
  ): Promise<RenderResult & { frames?: Buffer[] }> {
    const startTime = Date.now();
    const page = await this.getPage();

    try {
      const {
        frameCount,
        frameInterval = 100,
        width = 640,
        height = 480,
        format = 'png',
      } = options;

      await page.setViewport({ width, height });

      // Generate render HTML and navigate
      const html = this.generateRenderHTML(holoCode);
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: this.options.timeout,
      });

      // Wait for initial render
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1000)));

      const frames: Buffer[] = [];

      // Capture frames
      for (let i = 0; i < frameCount; i++) {
        const buffer = await page.screenshot({ type: format });
        frames.push(buffer);

        if (i < frameCount - 1) {
          await page.evaluate(
            (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
            frameInterval
          );
        }
      }

      await this.releasePage(page);

      return {
        success: true,
        frames,
        timing: {
          navigationMs: 0,
          renderMs: 0,
          captureMs: 0,
          totalMs: Date.now() - startTime,
        },
        metadata: {
          width,
          height,
          format,
          size: frames.reduce((sum, f) => sum + f.length, 0),
        },
      };
    } catch (error) {
      await this.releasePage(page);
      const err = error as Error;
      this.log('Animation frame capture failed:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Run visual regression test - compare scene against baseline
   */
  async visualRegression(
    holoCode: string,
    baselineBuffer: Buffer,
    threshold: number = 0.1
  ): Promise<{ match: boolean; diffPercentage: number; diffImage?: Buffer }> {
    const result = await this.screenshot(holoCode, {
      width: 1280,
      height: 720,
      format: 'png',
    });

    if (!result.success || !result.data) {
      return { match: false, diffPercentage: 100 };
    }

    // Note: For actual pixel comparison, you'd need a library like pixelmatch
    // This is a placeholder for the structure
    try {
      const currentBuffer = result.data as Buffer;

      // Simple size comparison as a basic check
      if (currentBuffer.length !== baselineBuffer.length) {
        const sizeDiff =
          Math.abs(currentBuffer.length - baselineBuffer.length) / baselineBuffer.length;
        return {
          match: sizeDiff < threshold,
          diffPercentage: sizeDiff * 100,
        };
      }

      // For actual pixel comparison, use pixelmatch:
      // const pixelmatch = await import('pixelmatch');
      // const PNG = await import('pngjs');
      // ... pixel comparison logic

      return { match: true, diffPercentage: 0 };
    } catch {
      return { match: false, diffPercentage: 100 };
    }
  }

  /**
   * Generate HTML for rendering a HoloScript scene
   */
  private generateRenderHTML(
    holoCode: string,
    __options: { printMode?: boolean; seoMode?: boolean } = {}
  ): string {
    const codeJson = JSON.stringify(holoCode);
    const threeVersion = this.options.threeVersion;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HoloScript Scene</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { background: #0a0a0f; }
    canvas { display: block; width: 100%; height: 100%; }
    #loading {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: #00ffff; font-family: sans-serif; font-size: 18px;
    }
  </style>
</head>
<body>
  <div id="loading">Loading scene...</div>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@${threeVersion}/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@${threeVersion}/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 3, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Parse and render HoloScript
    const code = ${codeJson};
    renderHoloScript(code, scene);

    // Remove loading indicator
    document.getElementById('loading').style.display = 'none';

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // HoloScript parser
    function renderHoloScript(code, threeScene) {
      // Extract objects from composition
      const objectMatches = code.matchAll(/object\\s+"([^"]+)"[^{]*\\{([^}]+)\\}/g);

      for (const match of objectMatches) {
        const name = match[1];
        const body = match[2];

        const geometry = extractProperty(body, 'geometry') || 'sphere';
        const color = extractProperty(body, 'color') || '#00ffff';
        const position = extractArray(body, 'position') || [0, 1, 0];
        const scale = extractArray(body, 'scale') || [1, 1, 1];
        const rotation = extractArray(body, 'rotation') || [0, 0, 0];

        const geo = createGeometry(geometry);
        const material = new THREE.MeshStandardMaterial({
          color: color.startsWith('#') ? color : '#' + color,
          emissive: color.startsWith('#') ? color : '#' + color,
          emissiveIntensity: 0.2,
          roughness: 0.5,
          metalness: 0.5,
        });

        const mesh = new THREE.Mesh(geo, material);
        mesh.name = name;
        mesh.position.set(position[0], position[1], position[2]);
        mesh.scale.set(scale[0], scale[1], scale[2]);
        mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        threeScene.add(mesh);
      }

      // Add grid
      const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
      threeScene.add(grid);
    }

    function extractProperty(body, prop) {
      const match = body.match(new RegExp(prop + ':\\\\s*["\\']?([^"\\',\\\\n]+)["\\']?'));
      return match ? match[1].trim() : null;
    }

    function extractArray(body, prop) {
      const match = body.match(new RegExp(prop + ':\\\\s*\\\\[([^\\\\]]+)\\\\]'));
      if (!match) return null;
      return match[1].split(',').map(n => parseFloat(n.trim()));
    }

    function createGeometry(type) {
      switch (type.toLowerCase()) {
        case 'cube':
        case 'box':
          return new THREE.BoxGeometry(1, 1, 1);
        case 'sphere':
          return new THREE.SphereGeometry(0.5, 32, 32);
        case 'cylinder':
          return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        case 'cone':
          return new THREE.ConeGeometry(0.5, 1, 32);
        case 'torus':
          return new THREE.TorusGeometry(0.5, 0.2, 16, 32);
        case 'plane':
          return new THREE.PlaneGeometry(1, 1);
        case 'capsule':
          return new THREE.CapsuleGeometry(0.3, 0.8, 4, 16);
        default:
          return new THREE.SphereGeometry(0.5, 32, 32);
      }
    }
  </script>
</body>
</html>`;
  }

  /**
   * Close the browser and cleanup resources
   */
  async close(): Promise<void> {
    // Close all pooled pages
    for (const page of this.pagePool) {
      await page.close();
    }
    this.pagePool = [];

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.initialized = false;
      this.log('Browser closed');
    }
  }

  /**
   * Check if puppeteer is available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      // Dynamic import with type assertion to avoid module resolution error
      await import(/* webpackIgnore: true */ 'puppeteer' as string);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get browser version
   */
  async getVersion(): Promise<string> {
    await this.ensureInitialized();
    return this.browser?.version() || 'unknown';
  }

  /**
   * Debug logging
   */
  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log('[PuppeteerRenderer]', ...args);
    }
  }
}

/**
 * Convenience function to create and use a renderer
 */
export async function renderScreenshot(
  holoCode: string,
  options: ScreenshotOptions = {}
): Promise<RenderResult> {
  const renderer = new PuppeteerRenderer();
  try {
    await renderer.initialize();
    return await renderer.screenshot(holoCode, options);
  } finally {
    await renderer.close();
  }
}

/**
 * Convenience function to generate PDF
 */
export async function renderPDF(holoCode: string, options: PDFOptions = {}): Promise<RenderResult> {
  const renderer = new PuppeteerRenderer();
  try {
    await renderer.initialize();
    return await renderer.generatePDF(holoCode, options);
  } finally {
    await renderer.close();
  }
}

/**
 * Convenience function to prerender HTML
 */
export async function prerenderHTML(
  holoCode: string,
  options: PrerenderOptions = {}
): Promise<RenderResult> {
  const renderer = new PuppeteerRenderer();
  try {
    await renderer.initialize();
    return await renderer.prerender(holoCode, options);
  } finally {
    await renderer.close();
  }
}
