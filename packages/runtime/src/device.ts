/**
 * @holoscript/runtime - Device Detection
 *
 * Detects device capabilities for adaptive rendering and input handling.
 */

export interface DeviceCapabilities {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  isVRCapable: boolean;
  isARCapable: boolean;
  prefersReducedMotion: boolean;
  prefersDarkMode: boolean;
  prefersHighContrast: boolean;
  devicePixelRatio: number;
  maxTextureSize: number;
  supportsWebGL2: boolean;
  supportsWebGPU: boolean;
  hasGamepad: boolean;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
}

/**
 * Device detection utilities
 */
export const device = {
  /**
   * Check if running on mobile device
   */
  get isMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  },

  /**
   * Check if running on tablet
   */
  get isTablet(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|Android/i.test(navigator.userAgent) && !/Mobile/i.test(navigator.userAgent);
  },

  /**
   * Check if running on desktop
   */
  get isDesktop(): boolean {
    return !this.isMobile && !this.isTablet;
  },

  /**
   * Check if device supports touch
   */
  get isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  },

  /**
   * Check if WebXR VR is supported
   */
  get isVRCapable(): boolean {
    if (typeof navigator === 'undefined') return false;
    return 'xr' in navigator;
  },

  /**
   * Check if WebXR AR is supported
   */
  get isARCapable(): boolean {
    if (typeof navigator === 'undefined') return false;
    return 'xr' in navigator;
  },

  /**
   * Check VR session support (async)
   */
  async supportsVR(): Promise<boolean> {
    if (!this.isVRCapable) return false;
    try {
      // @ts-ignore - WebXR API
      return (await navigator.xr?.isSessionSupported?.('immersive-vr')) ?? false;
    } catch {
      return false;
    }
  },

  /**
   * Check AR session support (async)
   */
  async supportsAR(): Promise<boolean> {
    if (!this.isARCapable) return false;
    try {
      // @ts-ignore - WebXR API
      return (await navigator.xr?.isSessionSupported?.('immersive-ar')) ?? false;
    } catch {
      return false;
    }
  },

  /**
   * Check if user prefers reduced motion
   */
  get prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  /**
   * Check if user prefers dark mode
   */
  get prefersDarkMode(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  },

  /**
   * Check if user prefers high contrast
   */
  get prefersHighContrast(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-contrast: more)').matches;
  },

  /**
   * Get device pixel ratio
   */
  get devicePixelRatio(): number {
    if (typeof window === 'undefined') return 1;
    return window.devicePixelRatio || 1;
  },

  /**
   * Check WebGL2 support
   */
  get supportsWebGL2(): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch {
      return false;
    }
  },

  /**
   * Check WebGPU support
   */
  get supportsWebGPU(): boolean {
    if (typeof navigator === 'undefined') return false;
    return 'gpu' in navigator;
  },

  /**
   * Get max texture size (requires WebGL context)
   */
  getMaxTextureSize(): number {
    if (typeof document === 'undefined') return 4096;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return 4096;
      return gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } catch {
      return 4096;
    }
  },

  /**
   * Check if gamepad is connected
   */
  get hasGamepad(): boolean {
    if (typeof navigator === 'undefined') return false;
    const gamepads = navigator.getGamepads?.() || [];
    return gamepads.some((gp) => gp !== null);
  },

  /**
   * Get screen dimensions
   */
  get screenWidth(): number {
    if (typeof window === 'undefined') return 1920;
    return window.innerWidth;
  },

  get screenHeight(): number {
    if (typeof window === 'undefined') return 1080;
    return window.innerHeight;
  },

  /**
   * Get screen orientation
   */
  get orientation(): 'portrait' | 'landscape' {
    if (typeof window === 'undefined') return 'landscape';
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  },

  /**
   * Get all capabilities as an object
   */
  getCapabilities(): DeviceCapabilities {
    return {
      isMobile: this.isMobile,
      isTablet: this.isTablet,
      isDesktop: this.isDesktop,
      isTouchDevice: this.isTouchDevice,
      isVRCapable: this.isVRCapable,
      isARCapable: this.isARCapable,
      prefersReducedMotion: this.prefersReducedMotion,
      prefersDarkMode: this.prefersDarkMode,
      prefersHighContrast: this.prefersHighContrast,
      devicePixelRatio: this.devicePixelRatio,
      maxTextureSize: this.getMaxTextureSize(),
      supportsWebGL2: this.supportsWebGL2,
      supportsWebGPU: this.supportsWebGPU,
      hasGamepad: this.hasGamepad,
      screenWidth: this.screenWidth,
      screenHeight: this.screenHeight,
      orientation: this.orientation,
    };
  },

  /**
   * Listen for orientation changes
   */
  onOrientationChange(callback: (orientation: 'portrait' | 'landscape') => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const handler = () => callback(this.orientation);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  },

  /**
   * Listen for reduced motion preference changes
   */
  onReducedMotionChange(callback: (prefersReduced: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => callback(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  },

  /**
   * Listen for dark mode preference changes
   */
  onDarkModeChange(callback: (prefersDark: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => callback(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  },

  /**
   * Listen for gamepad connection
   */
  onGamepadChange(callback: (connected: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const connectHandler = () => callback(true);
    const disconnectHandler = () => callback(this.hasGamepad);

    window.addEventListener('gamepadconnected', connectHandler);
    window.addEventListener('gamepaddisconnected', disconnectHandler);

    return () => {
      window.removeEventListener('gamepadconnected', connectHandler);
      window.removeEventListener('gamepaddisconnected', disconnectHandler);
    };
  },
};

// Named exports for convenience
export const isMobile = () => device.isMobile;
export const isTablet = () => device.isTablet;
export const isDesktop = () => device.isDesktop;
export const isTouchDevice = () => device.isTouchDevice;
export const isVRCapable = () => device.isVRCapable;
export const prefersReducedMotion = () => device.prefersReducedMotion;
export const prefersDarkMode = () => device.prefersDarkMode;

export default device;
