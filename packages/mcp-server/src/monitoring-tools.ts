import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { telemetry } from '@holoscript/core';

export const monitoringTools: Tool[] = [
  {
    name: 'get_telemetry_metrics',
    description: 'System: Retrieves the current Prometheus-style telemetry snapshot including counters, gauges, and latency histograms from the spatial runtime.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handleMonitoringTool(
  name: string,
  _args: Record<string, any>
): Promise<any | null> {
  if (name === 'get_telemetry_metrics') {
    return {
      status: 'success',
      metrics: telemetry.getSnapshot(),
    };
  }
  return null;
}
