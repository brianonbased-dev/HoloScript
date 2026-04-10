import { NextResponse } from 'next/server';

interface PluginNodeType {
  id: string;
  label: string;
  expression: string;
  arity: 1 | 2;
}

const DEFAULT_NODE_TYPES: PluginNodeType[] = [
  {
    id: 'noise-fbm',
    label: 'fBM Noise',
    expression: 'sin({a} * 6.2831) * 0.5 + 0.5',
    arity: 1,
  },
  {
    id: 'pulse',
    label: 'Pulse',
    expression: 'smoothstep(0.2, 0.8, sin({a} * {b}))',
    arity: 2,
  },
  {
    id: 'soft-threshold',
    label: 'Soft Threshold',
    expression: 'smoothstep({b} - 0.1, {b} + 0.1, {a})',
    arity: 2,
  },
];

export async function GET() {
  return NextResponse.json({
    nodeTypes: DEFAULT_NODE_TYPES,
    sdkVersion: '0.1.0',
    docs: '/api/docs#/plugins',
  });
}
