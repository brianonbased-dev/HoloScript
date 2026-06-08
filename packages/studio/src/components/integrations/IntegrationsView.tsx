'use client';

/**
 * IntegrationsView — /integrations page host
 *
 * Native body: the breadcrumb shell is defined in
 * compositions/studio/integrations.hsplus and rendered by HoloSurfaceRenderer.
 * IntegrationsView is reduced to host responsibilities:
 *   1. Load the composition via useHoloComposition('/api/surface/integrations')
 *   2. Handle "back" emit → window.history.back()
 *   3. @slot ServiceConnectorPanel (irreducible: Lucide tabs, OAuth modal,
 *      SSE activity stream, Zustand connectorStore mutations)
 *
 * @see compositions/studio/integrations.hsplus — source of truth for shell UI
 * @module integrations/IntegrationsView
 */

import React from 'react';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { ServiceConnectorPanel } from '@/components/integrations/ServiceConnectorPanel';
import { ConnectorStatusOverview } from '@/components/integrations/ConnectorStatusOverview';

export function IntegrationsView() {
  const composition = useHoloComposition('/api/surface/integrations');

  const handleEmit = (event: string) => {
    if (event === 'back') {
      window.history.back();
    }
  };

  return (
    <div className="flex h-screen flex-col bg-studio-bg">
      {/* Native composition shell — breadcrumb nav */}
      {!composition.loading && !composition.error ? (
        <HoloSurfaceRenderer
          nodes={composition.nodes}
          state={composition.state}
          computed={composition.computed}
          templates={composition.templates}
          onEmit={handleEmit}
          className="holo-surface-integrations"
        />
      ) : (
        // Fallback while composition loads — minimal breadcrumb keeps layout stable
        <div className="flex items-center gap-2 border-b border-studio-border px-6 py-3">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-xs text-studio-muted transition-colors hover:text-studio-text"
          >
            ← Back to Studio
          </button>
          <span className="text-xs text-studio-muted">/</span>
          <span className="text-xs font-medium text-studio-text">Service Integrations</span>
        </div>
      )}

      {/* At-a-glance health grid — all connectors + MCP infra in one view */}
      <ConnectorStatusOverview />

      {/* Irreducible widget — stays as @slot */}
      <div className="flex-1 overflow-hidden">
        <ServiceConnectorPanel onClose={() => window.history.back()} />
      </div>
    </div>
  );
}
