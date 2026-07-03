'use client';

/**
 * useSceneExport triggers scene downloads through /api/export and SDK generation
 * through the Studio MCP proxy.
 */

import { useState, useCallback } from 'react';
import { useSceneStore, useSceneGraphStore } from '@/lib/stores';
import { StudioEvents } from '@/lib/analytics';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';

export type ExportFormat = 'gltf' | 'usd' | 'usdz' | 'json' | 'sdk';
export type ExportStatus = 'idle' | 'exporting' | 'done' | 'error';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toKebabIdentifier(value?: string): string {
  const slug = (value ?? 'studio-export')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'studio-export';
}

function toPascalIdentifier(value?: string): string {
  const words = (value ?? 'studio export').match(/[A-Za-z0-9]+/g) ?? ['Studio', 'Export'];
  const identifier = words
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('');

  return /^[A-Za-z_]/.test(identifier) ? identifier : `Studio${identifier}`;
}

function getResultPayload(payload: unknown): unknown {
  return isRecord(payload) && 'result' in payload ? payload.result : payload;
}

function getPayloadError(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.error === 'string') return payload.error;

  const result = getResultPayload(payload);
  if (isRecord(result) && typeof result.error === 'string') return result.error;

  return null;
}

async function readJsonResponse(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function createSdkBundle(payload: unknown, code: string, sceneName?: string): string {
  const result = getResultPayload(payload);
  const expandedResult =
    isRecord(result) && 'output' in result
      ? {
          ...result,
          output: typeof result.output === 'string' ? parseJsonString(result.output) : result.output,
        }
      : result;
  const files = isRecord(expandedResult) ? expandedResult.output : undefined;

  return JSON.stringify(
    {
      kind: 'HoloScriptStudioSDKExport',
      tool: 'compile_to_sdk',
      sceneName,
      generatedAt: new Date().toISOString(),
      source: {
        fileName: 'source.holoscript',
        code,
      },
      files,
      result: expandedResult,
    },
    null,
    2
  );
}

async function compileSdkExport(code: string, sceneName?: string) {
  const slug = toKebabIdentifier(sceneName);
  const clientClassName = `${toPascalIdentifier(sceneName)}SDKClient`;
  const res = await fetch('/api/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'compile_to_sdk',
      input: {
        code,
        options: {
          language: 'typescript',
          clientClassName,
          packageName: `@holoscript/${slug}-sdk`,
          includePackageJson: true,
          includeTsConfig: true,
          includeReadme: true,
        },
      },
    }),
  });

  const payload = await readJsonResponse(res);
  const payloadError = getPayloadError(payload);

  if (!res.ok || payloadError) {
    throw new Error(payloadError ?? `HTTP ${res.status}`);
  }

  const result = getResultPayload(payload);
  if (isRecord(result) && result.success === false) {
    throw new Error(typeof result.error === 'string' ? result.error : 'compile_to_sdk failed');
  }

  return {
    blob: new Blob([createSdkBundle(payload, code, sceneName)], {
      type: 'application/json',
    }),
    fileName: `${slug}-sdk.json`,
  };
}

export function useSceneExport() {
  const code = useSceneStore((s) => s.code) ?? '';
  const nodes = useSceneGraphStore((s) => s.nodes);
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const exportScene = useCallback(
    async (format: ExportFormat, sceneName?: string) => {
      setStatus('exporting');
      setError(null);
      try {
        if (format === 'sdk') {
          const { blob, fileName } = await compileSdkExport(code, sceneName);
          downloadBlob(blob, fileName);
          StudioEvents.projectExported(format, sceneName);
          setStatus('done');
          setTimeout(() => setStatus('idle'), SAVE_FEEDBACK_DURATION);
          return;
        }

        const res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            format,
            sceneName,
            // Include full scene graph (with traits) for JSON round-trip
            ...(format === 'json' ? { nodes } : {}),
          }),
        });

        if (!res.ok) {
          const err = await readJsonResponse(res);
          throw new Error(getPayloadError(err) ?? `HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const fileName =
          res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
          `scene_export.zip`;
        downloadBlob(blob, fileName);

        StudioEvents.projectExported(format, sceneName);
        setStatus('done');
        setTimeout(() => setStatus('idle'), SAVE_FEEDBACK_DURATION);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        StudioEvents.exportFailed(format, errMsg);
        setError(errMsg);
        setStatus('error');
      }
    },
    [code, nodes]
  );

  return { status, error, exportScene };
}
