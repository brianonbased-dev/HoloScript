/**
 * HoloScriptPreview - Standalone React component for rendering HoloScript 3D scenes.
 *
 * Embeddable in GitHub PRs, documentation sites, playgrounds, and any React application.
 * Uses Three.js for WebGL rendering and a lightweight HoloScript parser for scene construction.
 *
 * @example
 * ```tsx
 * import { HoloScriptPreview } from '@holoscript/preview-component';
 *
 * function App() {
 *   return (
 *     <HoloScriptPreview
 *       code={`
 *         orb mySphere {
 *           geometry: "sphere"
 *           color: "cyan"
 *           position: [0, 1, 0]
 *           animate: "float"
 *         }
 *       `}
 *       width={800}
 *       height={600}
 *     />
 *   );
 * }
 * ```
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { RendererConfig } from '../engine/types';
import { parseHoloScript } from '../engine/parser';
import { PreviewRenderer } from '../engine/renderer';
import { PreviewToolbar } from './PreviewToolbar';
import { CodePanel } from './CodePanel';
import { StatsOverlay } from './StatsOverlay';

export interface HoloScriptPreviewProps {
  /**
   * HoloScript source code to render.
   * When changed, the scene will be re-parsed and re-rendered.
   */
  code: string;

  /** Width of the preview. Accepts number (px) or CSS string. Default: '100%' */
  width?: number | string;

  /** Height of the preview. Accepts number (px) or CSS string. Default: '400px' */
  height?: number | string;

  /** File name to display in the overlay. */
  fileName?: string;

  /** Enable the built-in code editor panel. Default: false */
  editable?: boolean;

  /** Show the toolbar with camera, wireframe, grid, axes controls. Default: true */
  showToolbar?: boolean;

  /** Show the stats overlay (object count). Default: true */
  showStats?: boolean;

  /** Embed mode: minimal chrome, no toolbar. Default: false */
  embed?: boolean;

  /** Renderer configuration. */
  rendererConfig?: RendererConfig;

  /**
   * Callback when code is changed in the built-in editor.
   * Only fires when `editable` is true.
   */
  onCodeChange?: (code: string) => void;

  /**
   * Callback when scene parsing encounters errors.
   */
  onError?: (error: Error) => void;

  /**
   * Callback after scene renders successfully with object count.
   */
  onRender?: (objectCount: number) => void;

  /** Additional CSS class name for the outer container. */
  className?: string;

  /** Additional inline styles for the outer container. */
  style?: React.CSSProperties;

  /**
   * Provide a custom Three.js module. If not provided, the component
   * will attempt to import 'three' from the host application.
   */
  threeModule?: any;

  /**
   * Provide OrbitControls constructor. If not provided, the component
   * will attempt to import from 'three/examples/jsm/controls/OrbitControls.js'.
   */
  orbitControls?: any;
}

const containerBaseStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  background: '#1a1a2e',
  borderRadius: '8px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const canvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

const errorOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '40px',
  left: '10px',
  right: '10px',
  background: 'rgba(200, 50, 50, 0.9)',
  padding: '10px 14px',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '12px',
  fontFamily: 'monospace',
  zIndex: 20,
};

export const HoloScriptPreview: React.FC<HoloScriptPreviewProps> = ({
  code,
  width = '100%',
  height = '400px',
  fileName,
  editable = false,
  showToolbar = true,
  showStats = true,
  embed = false,
  rendererConfig,
  onCodeChange,
  onError,
  onRender,
  className,
  style,
  threeModule: threeModuleProp,
  orbitControls: orbitControlsProp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PreviewRenderer | null>(null);

  const [objectCount, setObjectCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wireframeActive, setWireframeActive] = useState(false);
  const [gridActive, setGridActive] = useState(rendererConfig?.showGrid ?? true);
  const [axesActive, setAxesActive] = useState(rendererConfig?.showAxes ?? true);
  const [codeVisible, setCodeVisible] = useState(false);
  const [editableCode, setEditableCode] = useState(code);
  const [threeLoaded, setThreeLoaded] = useState(false);
  const threeRef = useRef<any>(null);
  const orbitControlsRef = useRef<any>(null);

  // Keep editable code in sync with prop changes
  useEffect(() => {
    setEditableCode(code);
  }, [code]);

  // Load Three.js
  useEffect(() => {
    if (threeModuleProp) {
      threeRef.current = threeModuleProp;
      orbitControlsRef.current = orbitControlsProp;
      setThreeLoaded(true);
      return;
    }

    // Dynamic import for Three.js
    let cancelled = false;
    (async () => {
      try {
        const THREE = await import('three');
        if (cancelled) return;
        threeRef.current = THREE;

        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mod = await import('three/examples/jsm/controls/OrbitControls.js');
          const { OrbitControls } = mod as Record<string, unknown>;
          if (!cancelled) {
            orbitControlsRef.current = OrbitControls;
          }
        } catch {
          // OrbitControls may not be available -- that's OK
        }

        if (!cancelled) {
          setThreeLoaded(true);
        }
      } catch (_err) {
        if (!cancelled) {
          const msg = 'Three.js could not be loaded. Pass it via the threeModule prop.';
          setError(msg);
          onError?.(new Error(msg));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threeModuleProp, orbitControlsProp, onError]);

  // Initialize renderer when Three.js is ready
  useEffect(() => {
    if (!threeLoaded || !canvasRef.current || !containerRef.current) return;

    const renderer = new PreviewRenderer(
      threeRef.current,
      canvasRef.current,
      containerRef.current,
      rendererConfig
    );

    renderer.init(orbitControlsRef.current);
    renderer.startAnimationLoop();
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threeLoaded]); // Only re-init when THREE loads; rendererConfig changes handled separately

  // Render scene from code
  const renderScene = useCallback(
    (sourceCode: string) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      try {
        setError(null);
        const result = parseHoloScript(sourceCode);

        renderer.clearObjects();
        renderer.applyEnvironment(result.environment);

        for (const obj of result.objects) {
          renderer.addObject(obj);
        }

        const count = renderer.getObjectCount();
        setObjectCount(count);
        onRender?.(count);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        onError?.(err instanceof Error ? err : new Error(msg));
      }
    },
    [onError, onRender]
  );

  // Re-render when code prop changes
  useEffect(() => {
    renderScene(code);
  }, [code, renderScene, threeLoaded]);

  // Toolbar handlers
  const handleResetCamera = useCallback(() => {
    rendererRef.current?.resetCamera();
  }, []);

  const handleToggleWireframe = useCallback(() => {
    const active = rendererRef.current?.toggleWireframe();
    if (active !== undefined) setWireframeActive(active);
  }, []);

  const handleToggleGrid = useCallback(() => {
    const active = rendererRef.current?.toggleGrid();
    if (active !== undefined) setGridActive(active);
  }, []);

  const handleToggleAxes = useCallback(() => {
    const active = rendererRef.current?.toggleAxes();
    if (active !== undefined) setAxesActive(active);
  }, []);

  const handleToggleCode = useCallback(() => {
    setCodeVisible((prev) => !prev);
  }, []);

  const handleCodeChange = useCallback(
    (newCode: string) => {
      setEditableCode(newCode);
      onCodeChange?.(newCode);
    },
    [onCodeChange]
  );

  const handleEditorRender = useCallback(() => {
    renderScene(editableCode);
  }, [editableCode, renderScene]);

  // Container dimensions
  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      ...containerBaseStyle,
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
      ...style,
    }),
    [width, height, style]
  );

  const effectiveShowToolbar = showToolbar && !embed;
  const effectiveShowStats = showStats && !embed;

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      data-testid="holoscript-preview"
      role="region"
      aria-label="HoloScript 3D Preview"
    >
      <canvas ref={canvasRef} style={canvasStyle} />

      {effectiveShowStats && <StatsOverlay objectCount={objectCount} fileName={fileName} />}

      {effectiveShowToolbar && (
        <PreviewToolbar
          onResetCamera={handleResetCamera}
          onToggleWireframe={handleToggleWireframe}
          onToggleGrid={handleToggleGrid}
          onToggleAxes={handleToggleAxes}
          onToggleCode={handleToggleCode}
          wireframeActive={wireframeActive}
          gridActive={gridActive}
          axesActive={axesActive}
          codeVisible={codeVisible}
          showCodeToggle={editable}
        />
      )}

      {editable && (
        <CodePanel
          code={editableCode}
          onChange={handleCodeChange}
          onRender={handleEditorRender}
          visible={codeVisible}
        />
      )}

      {error && (
        <div style={errorOverlayStyle} role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

HoloScriptPreview.displayName = 'HoloScriptPreview';
