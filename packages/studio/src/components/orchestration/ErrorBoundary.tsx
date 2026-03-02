/**
 * OrchestrationErrorBoundary
 *
 * @deprecated Use StudioErrorBoundary from '@/components/ui/StudioErrorBoundary' instead.
 * This file re-exports StudioErrorBoundary with label="Orchestration" as a compatibility shim.
 * Will be removed in a future release.
 */

import React from 'react';
import { StudioErrorBoundary } from '@/components/ui/StudioErrorBoundary';

interface OrchestrationErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * @deprecated Use `<StudioErrorBoundary label="Orchestration">` directly.
 */
export function OrchestrationErrorBoundary({ children }: OrchestrationErrorBoundaryProps) {
  return (
    <StudioErrorBoundary label="Orchestration">
      {children}
    </StudioErrorBoundary>
  );
}
