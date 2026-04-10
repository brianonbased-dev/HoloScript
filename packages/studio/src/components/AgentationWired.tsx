'use client';

import { Agentation } from 'agentation';
import { useAgentation } from '../hooks/useAgentation';

/**
 * Agentation overlay with full hook integration.
 * Renders only in development mode (gated by parent).
 *
 * Wires: toast notifications, API session persistence,
 * knowledge store promotion (blocking/fix annotations),
 * and clipboard copy on submit.
 */
export function AgentationWired() {
  const { agentationProps } = useAgentation();
  return <Agentation {...agentationProps} />;
}
