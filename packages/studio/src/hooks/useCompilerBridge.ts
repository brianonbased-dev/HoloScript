'use client';

/**
 * useCompilerBridge — React hook for the HoloScript WASM Compiler Bridge
 *
 * Provides access to the CompilerBridge singleton with automatic initialization,
 * platform detection, and lazy platform plugin loading.
 *
 * Usage:
 * ```tsx
 * function Editor() {
 *   const { parse, compile, validate, status, isReady } = useCompilerBridge();
 *
 *   const handleParse = async () => {
 *     const result = await parse(editorValue);
 *     // result.ast or result.errors
 *   };
 *
 *   const handleCompile = async () => {
 *     const result = await compile(editorValue, 'threejs');
 *     if (result.type === 'text') console.log(result.data);
 *   };
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CompilerBridge,
  getCompilerBridge,
  type CompilerBridgeStatus,
  type CompileTarget,
  type PlatformTarget,
  type CompileResult,
  type ValidationResult,
  type Diagnostic,
  type TraitDef,
} from '@/lib/wasm-compiler-bridge';
import {
  detectPlatform,
  type PlatformCapabilities,
} from '@/lib/platform-detect';
import {
  getPluginLoader,
  type PlatformPluginLoader,
} from '@/lib/platform-plugin-loader';

// ═══════════════════════════════════════════════════════════════════
// Hook Return Type
// ═══════════════════════════════════════════════════════════════════

export interface UseCompilerBridgeReturn {
  /** Bridge is initialized and ready for use */
  isReady: boolean;
  /** Bridge initialization is in progress */
  isLoading: boolean;
  /** Bridge or platform capabilities */
  status: CompilerBridgeStatus | null;
  /** Detected platform capabilities */
  platform: PlatformCapabilities | null;
  /** Initialization error (if any) */
  error: string | null;

  // ── Parser ──────────────────────────────────────────────────────
  /** Parse HoloScript source → AST */
  parse(source: string): Promise<{ ast?: unknown; errors?: Diagnostic[] }>;

  // ── Validator ───────────────────────────────────────────────────
  /** Validate HoloScript source */
  validate(source: string): Promise<ValidationResult>;

  // ── Compiler (engine-core targets) ──────────────────────────────
  /** Compile to engine-core target (threejs, babylonjs, gltf, etc.) */
  compile(source: string, target: CompileTarget): Promise<CompileResult>;

  // ── Compiler (platform plugin targets) ──────────────────────────
  /** Compile to platform target (unity, godot, unreal, etc.) — loads plugin on demand */
  compileForPlatform(source: string, target: PlatformTarget): Promise<CompileResult>;

  // ── Generator ───────────────────────────────────────────────────
  /** Generate object from natural language */
  generateObject(description: string): Promise<string>;
  /** Generate scene from natural language */
  generateScene(description: string): Promise<string>;
  /** Suggest traits from description */
  suggestTraits(description: string): Promise<TraitDef[]>;

  // ── Formatter ───────────────────────────────────────────────────
  /** Format HoloScript source code */
  format(source: string): Promise<string>;

  // ── Traits ──────────────────────────────────────────────────────
  /** List all available traits */
  listTraits(): Promise<TraitDef[]>;
  /** List traits by category */
  listTraitsByCategory(category: string): Promise<TraitDef[]>;

  // ── Type Checker ────────────────────────────────────────────────
  /** Type-check source */
  checkTypes(source: string): Promise<Diagnostic[]>;
  /** Get completions at offset */
  completionsAt(source: string, offset: number): Promise<string[]>;

  // ── Utilities ───────────────────────────────────────────────────
  /** Force re-initialize the bridge */
  reinitialize(): Promise<void>;
  /** Get available platform targets */
  availablePlatformTargets: PlatformTarget[];
}

// ═══════════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════════

export function useCompilerBridge(): UseCompilerBridgeReturn {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<CompilerBridgeStatus | null>(null);
  const [platform, setPlatform] = useState<PlatformCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bridgeRef = useRef<CompilerBridge | null>(null);
  const pluginLoaderRef = useRef<PlatformPluginLoader | null>(null);
  const initRef = useRef(false);

  // ── Initialize on mount ─────────────────────────────────────────

  const initialize = useCallback(async () => {
    if (initRef.current) return;
    initRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Detect platform capabilities
      const caps = await detectPlatform();
      setPlatform(caps);

      // 2. Get bridge singleton
      const bridge = getCompilerBridge();
      bridgeRef.current = bridge;

      // 3. Initialize with recommended world
      const wasmUrl = caps.isTauri
        ? '/wasm/holoscript.component.wasm'  // Tauri bundles it
        : '/wasm/holoscript.component.wasm'; // Browser fetches from public/

      const bridgeStatus = await bridge.init(wasmUrl, caps.recommendedWorld);
      setStatus(bridgeStatus);

      // 4. Initialize plugin loader
      pluginLoaderRef.current = getPluginLoader({ platform: caps });

      setIsReady(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[useCompilerBridge] Init failed:', msg);

      // Still mark as "ready" — fallback mode is usable
      setIsReady(true);
      setStatus({
        backend: 'typescript-fallback',
        wasmLoaded: false,
        binarySize: 0,
        loadTimeMs: 0,
        world: 'none',
        version: 'fallback',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initialize();
    return () => {
      // Don't destroy on unmount — singleton persists across navigations
    };
  }, [initialize]);

  // ── Wrapped API methods ─────────────────────────────────────────

  const bridge = bridgeRef.current;

  const parse = useCallback(async (source: string) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.parse(source);
  }, []);

  const validate = useCallback(async (source: string) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.validate(source);
  }, []);

  const compile = useCallback(async (source: string, target: CompileTarget) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.compile(source, target);
  }, []);

  const compileForPlatform = useCallback(async (source: string, target: PlatformTarget) => {
    const b = bridgeRef.current ?? getCompilerBridge();

    // First, parse to AST JSON via the engine core
    const parseResult = await b.parse(source);
    if (!parseResult.ast) {
      return {
        type: 'error' as const,
        diagnostics: (parseResult.errors ?? [{ severity: 'error' as const, message: 'Parse failed' }]),
      };
    }

    // Then, compile AST via platform plugin
    const loader = pluginLoaderRef.current ?? getPluginLoader();
    const astJson = JSON.stringify(parseResult.ast);
    return loader.compileForPlatform(astJson, target);
  }, []);

  const generateObject = useCallback(async (description: string) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.generateObject(description);
  }, []);

  const generateScene = useCallback(async (description: string) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.generateScene(description);
  }, []);

  const suggestTraits = useCallback(async (description: string) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.suggestTraits(description);
  }, []);

  const format = useCallback(async (source: string) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.format(source);
  }, []);

  const listTraits = useCallback(async () => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.listTraits();
  }, []);

  const listTraitsByCategory = useCallback(async (category: string) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.listTraitsByCategory(category);
  }, []);

  const checkTypes = useCallback(async (source: string) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.checkTypes(source);
  }, []);

  const completionsAt = useCallback(async (source: string, offset: number) => {
    const b = bridgeRef.current ?? getCompilerBridge();
    return b.completionsAt(source, offset);
  }, []);

  const reinitialize = useCallback(async () => {
    initRef.current = false;
    bridgeRef.current?.destroy();
    bridgeRef.current = null;
    setIsReady(false);
    setIsLoading(true);
    setError(null);
    await initialize();
  }, [initialize]);

  const availablePlatformTargets = pluginLoaderRef.current?.getSupportedTargets() ?? [];

  return {
    isReady,
    isLoading,
    status,
    platform,
    error,
    parse,
    validate,
    compile,
    compileForPlatform,
    generateObject,
    generateScene,
    suggestTraits,
    format,
    listTraits,
    listTraitsByCategory,
    checkTypes,
    completionsAt,
    reinitialize,
    availablePlatformTargets,
  };
}
