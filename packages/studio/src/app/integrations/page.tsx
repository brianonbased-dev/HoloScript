'use client';

/**
 * Service Integrations — /integrations
 *
 * Central hub for connecting external developer services (GitHub, Railway,
 * VSCode, App Store, Upstash) to enable deployment, testing, and collaboration
 * workflows from Studio.
 *
 * Part of the Studio Integration Hub vision (W.164-W.171, P.STUDIO.01).
 *
 * @module integrations/page
 */

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ServiceConnectorPanel } from '@/components/integrations/ServiceConnectorPanel';

export default function IntegrationsPage() {
  return (
    <div className="flex h-screen flex-col bg-studio-bg">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 border-b border-studio-border px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-studio-muted transition-colors hover:text-studio-text"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Studio
        </Link>
        <span className="text-xs text-studio-muted">/</span>
        <span className="text-xs font-medium text-studio-text">Service Integrations</span>
      </div>

      {/* Panel */}
      <div className="flex-1 overflow-hidden">
        <ServiceConnectorPanel onClose={() => window.history.back()} />
      </div>
    </div>
  );
}
