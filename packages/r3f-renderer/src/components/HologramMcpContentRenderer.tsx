'use client';

/**
 * HologramMcpContentRenderer - chat-surface integration point for MCP tool
 * responses whose content_type is a hologram.
 *
 * Studio chat (and any agent UI built on top of @holoscript/r3f-renderer)
 * passes raw MCP envelopes to this component. If the envelope carries a
 * hologram content_type, it routes to one of three renderers:
 *
 *   - 'parallax'  -> WebGL parallax card (default fallback)
 *   - 'quilt'     -> Looking Glass quilt PNG via <img>
 *   - 'mvhevc'    -> Apple Vision Pro MV-HEVC <video>
 *   - 'holo-code' -> Inline .holo source preview (parsed by Studio downstream)
 *
 * Otherwise renders nothing (children of the chat bubble handle the text
 * fallback themselves).
 *
 * Spec: task_1778114362909_zp7u
 *
 * Note: this component intentionally does NOT depend on @holoscript/studio.
 * The full HologramViewer with detectViewer() / Looking Glass dynamic import
 * lives in studio. This is the lightweight cross-package surface.
 */

import { useHologramMcpContent, type ResolvedHologramContent } from '../hooks/useHologramMcpContent';
import type { CSSProperties, ReactNode } from 'react';

// Public API

export interface HologramMcpContentRendererProps {
  /**
   * MCP tool response envelope. Anything `detectHologramContent` accepts.
   * Pass `null` / `undefined` to render nothing.
   */
  envelope: unknown;

  /**
   * Optional override that fully replaces the default renderer. Studio
   * passes its full {@link HologramViewer} here so the parallax route lights
   * up Looking Glass + Vision Pro fallback. When omitted, the default
   * lightweight renderer is used.
   */
  renderResolved?: (resolved: ResolvedHologramContent) => ReactNode;

  /**
   * Optional fallback rendered when detection misses - i.e. the envelope is
   * NOT a hologram response. Most callers leave this undefined so the chat
   * surface handles plain text itself.
   */
  fallback?: ReactNode;

  /** className forwarded to the outer wrapper. */
  className?: string;
}

// Default renderer

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 270;

function DefaultHologramMcpRenderer({ resolved }: { resolved: ResolvedHologramContent }) {
  const { route, response, assetUrl, holoCode, contentKey } = resolved;
  const size = response.hints?.size;
  const w = size?.[0] ?? DEFAULT_WIDTH;
  const h = size?.[1] ?? DEFAULT_HEIGHT;
  const background = response.hints?.background ?? '#0b0b1a';

  const wrapperStyle: CSSProperties = {
    width: `min(100%, ${w}px)`,
    aspectRatio: `${w} / ${h}`,
    background,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    color: '#e8e8ff',
    fontFamily: 'system-ui, sans-serif',
  };

  if (route === 'mvhevc' && assetUrl) {
    return (
      <div style={wrapperStyle} data-content-key={contentKey} data-route="mvhevc">
        <video
          src={assetUrl}
          autoPlay={response.hints?.animate !== false}
          loop
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', background }}
        />
        {response.meta.label && <Caption text={response.meta.label} />}
      </div>
    );
  }

  if (route === 'quilt' && assetUrl) {
    return (
      <div style={wrapperStyle} data-content-key={contentKey} data-route="quilt">
        <img
          src={assetUrl}
          alt={response.meta.label ?? 'Hologram quilt'}
          style={{ width: '100%', height: '100%', objectFit: 'contain', background }}
        />
        {response.meta.label && <Caption text={response.meta.label} />}
      </div>
    );
  }

  if (route === 'parallax' && assetUrl) {
    return (
      <div style={wrapperStyle} data-content-key={contentKey} data-route="parallax">
        <video
          src={assetUrl}
          autoPlay={response.hints?.animate !== false}
          loop
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', background }}
        />
        {response.meta.label && <Caption text={response.meta.label} />}
      </div>
    );
  }

  if (route === 'holo-code' && holoCode) {
    // Lightweight preview - Studio downstream replaces this via `renderResolved`
    // with the full HologramViewer that parses + compiles the .holo client-side.
    return (
      <div style={wrapperStyle} data-content-key={contentKey} data-route="holo-code">
        <pre
          style={{
            margin: 0,
            padding: 12,
            fontSize: 11,
            lineHeight: 1.4,
            overflow: 'auto',
            height: '100%',
            color: '#9fc8ff',
            background: 'rgba(0,0,0,0.35)',
          }}
        >
          {holoCode.slice(0, 4096)}
        </pre>
        {response.meta.label && <Caption text={response.meta.label} />}
      </div>
    );
  }

  // Fallback - content_type matched but no renderable payload (e.g. hash with
  // no studio base). Surface the text summary instead of a blank box.
  return (
    <div style={wrapperStyle} data-content-key={contentKey} data-route="text-fallback">
      <div style={{ padding: 12, fontSize: 12 }}>
        <strong>{response.meta.label ?? 'Hologram'}</strong>
        <p style={{ marginTop: 6 }}>{response.text}</p>
      </div>
    </div>
  );
}

function Caption({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '6px 10px',
        fontSize: 11,
        background: 'linear-gradient(0deg, rgba(0,0,0,0.65), rgba(0,0,0,0))',
        color: '#fff',
      }}
    >
      {text}
    </div>
  );
}

// Public component

export function HologramMcpContentRenderer({
  envelope,
  renderResolved,
  fallback = null,
  className,
}: HologramMcpContentRendererProps) {
  const { resolved, isHologram, error } = useHologramMcpContent(envelope);

  if (!isHologram) {
    return <>{fallback}</>;
  }

  if (error || !resolved) {
    return (
      <div
        className={className}
        style={{ padding: 8, fontSize: 12, color: '#ff8888' }}
        data-content-error="hologram"
      >
        Hologram render failed: {error ?? 'unknown error'}
      </div>
    );
  }

  return (
    <div
      className={className}
      data-hologram-content-type={resolved.response.content_type}
      data-hologram-route={resolved.route}
    >
      {renderResolved ? (
        renderResolved(resolved)
      ) : (
        <DefaultHologramMcpRenderer resolved={resolved} />
      )}
    </div>
  );
}
