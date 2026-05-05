'use client';

/**
 * HoloFileDropHandler — Drag-and-drop .holo file loader
 *
 * Accepts .holo composition files via drag-and-drop or file picker,
 * parses them with @holoscript/core parser, and populates sceneGraphStore
 * with the parsed objects, traits, and properties.
 *
 * Follows the AssetDropProcessor pattern for consistent Studio UX.
 */

import { useRef, useState, useCallback } from 'react';
import { Loader2, CheckCircle, UploadCloud, FileText } from 'lucide-react';
import { useSceneGraphStore, type SceneNode, type TraitConfig } from '@/lib/stores';
import { StudioEvents } from '@/lib/analytics';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcessingStatus {
  state: 'idle' | 'parsing' | 'done' | 'error';
  fileName?: string;
  message?: string;
  objectCount?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeId() {
  return `holo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Parse HoloScript composition source into SceneNodes.
 * This is a simplified parser that handles common .holo patterns.
 * For full parsing, delegate to @holoscript/core parser via API.
 */
async function parseHoloComposition(source: string): Promise<SceneNode[]> {
  const nodes: SceneNode[] = [];

  // Extract composition name
  const compMatch = source.match(/composition\s+"([^"]+)"/);
  const compositionName = compMatch ? compMatch[1] : 'HoloComposition';

  // Extract objects with regex (simplified parser for common patterns)
  const objectRegex = /object\s+"([^"]+)"\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
  let match;

  while ((match = objectRegex.exec(source)) !== null) {
    const objectName = match[1];
    const objectBody = match[2];

    // Parse traits (@traitName { ... } or @traitName)
    const traits: TraitConfig[] = [];
    const traitRegex = /@(\w+)(?:\s*\{([^}]*)\})?/g;
    let traitMatch;

    while ((traitMatch = traitRegex.exec(objectBody)) !== null) {
      const traitName = traitMatch[1];
      const traitProps = traitMatch[2];

      const trait: TraitConfig = {
        name: traitName,
        properties: traitProps ? parseTraitProperties(traitProps) : {},
      };
      traits.push(trait);
    }

    // Parse position
    const positionMatch = objectBody.match(/position:\s*\[([^\]]+)\]/);
    const position: [number, number, number] = positionMatch
      ? parseVector3(positionMatch[1])
      : [0, 0, 0];

    // Parse rotation
    const rotationMatch = objectBody.match(/rotation:\s*\[([^\]]+)\]/);
    const rotation: [number, number, number] = rotationMatch
      ? parseVector3(rotationMatch[1])
      : [0, 0, 0];

    // Parse scale
    const scaleMatch = objectBody.match(/scale:\s*\[([^\]]+)\]/);
    const scale: [number, number, number] = scaleMatch
      ? parseVector3(scaleMatch[1])
      : [1, 1, 1];

    // Parse geometry type
    const geometryMatch = objectBody.match(/@geometry\s*\{[^}]*type:\s*"([^"]+)"/);
    const geometryType = geometryMatch ? geometryMatch[1] : 'box';

    // Determine node type based on traits
    let nodeType: SceneNode['type'] = 'mesh';
    if (traits.some(t => t.name === 'character')) nodeType = 'gltfModel';
    if (traits.some(t => t.name === 'light')) nodeType = 'light';
    if (traits.some(t => t.name === 'camera')) nodeType = 'camera';
    if (traits.some(t => t.name === 'environment')) nodeType = 'group';

    const node: SceneNode = {
      id: makeId(),
      name: objectName,
      type: nodeType,
      parentId: null,
      position,
      rotation,
      scale,
      traits: [
        ...traits,
        {
          name: 'holo_composition',
          properties: {
            geometryType,
            compositionName,
          },
        },
      ],
    };

    nodes.push(node);
  }

  return nodes;
}

/**
 * Parse trait properties from a string like "type: \"helix\", radius: 1.0"
 */
function parseTraitProperties(propsStr: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  // Parse string values: key: "value"
  const stringRegex = /(\w+):\s*"([^"]+)"/g;
  let match;
  while ((match = stringRegex.exec(propsStr)) !== null) {
    props[match[1]] = match[2];
  }

  // Parse numeric values: key: 1.23 or key: 1
  const numberRegex = /(\w+):\s*(-?\d+\.?\d*)/g;
  while ((match = numberRegex.exec(propsStr)) !== null) {
    props[match[1]] = parseFloat(match[2]);
  }

  // Parse boolean values: key: true/false
  const boolRegex = /(\w+):\s*(true|false)/g;
  while ((match = boolRegex.exec(propsStr)) !== null) {
    props[match[1]] = match[2] === 'true';
  }

  // Parse vector arrays: key: [1, 2, 3]
  const vectorRegex = /(\w+):\s*\[([^\]]+)\]/g;
  while ((match = vectorRegex.exec(propsStr)) !== null) {
    const arr = match[2].split(',').map(s => parseFloat(s.trim()));
    props[match[1]] = arr;
  }

  // Parse object literals: key: { nested: value }
  const objectRegex = /(\w+):\s*\{([^}]+)\}/g;
  while ((match = objectRegex.exec(propsStr)) !== null) {
    props[match[1]] = parseTraitProperties(match[2]);
  }

  return props;
}

/**
 * Parse a vector3 string like "1, 2, 3" into [number, number, number]
 */
function parseVector3(str: string): [number, number, number] {
  const parts = str.split(',').map(s => parseFloat(s.trim()));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHoloFileDropHandler() {
  const addNode = useSceneGraphStore((s) => s.addNode);
  const [status, setStatus] = useState<ProcessingStatus>({ state: 'idle' });

  const processFile = useCallback(
    async (file: File) => {
      setStatus({ state: 'parsing', fileName: file.name });

      try {
        // Read file contents
        const source = await file.text();

        // Parse HoloScript composition
        setStatus({ state: 'parsing', fileName: file.name, message: 'Parsing composition...' });
        const nodes = await parseHoloComposition(source);

        if (nodes.length === 0) {
          throw new Error('No objects found in .holo file');
        }

        // Add nodes to scene graph
        let objectCount = 0;
        for (const node of nodes) {
          addNode(node);
          objectCount++;
        }

        StudioEvents.assetUploaded('holo', source.length / 1024);

        setStatus({
          state: 'done',
          fileName: file.name,
          objectCount,
          message: `Loaded ${objectCount} objects from ${file.name}`
        });

        setTimeout(() => setStatus({ state: 'idle' }), SAVE_FEEDBACK_DURATION * 2);

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse .holo file';
        setStatus({ state: 'error', fileName: file.name, message });
        console.error('HoloFileDropHandler error:', error);
      }
    },
    [addNode]
  );

  return { processFile, status };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HoloFileDropHandlerProps {
  children: React.ReactNode;
  className?: string;
}

export function HoloFileDropHandler({ children, className = '' }: HoloFileDropHandlerProps) {
  const { processFile, status } = useHoloFileDropHandler();
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;

    // Only activate for .holo files
    const items = Array.from(e.dataTransfer.items);
    const hasHoloFile = items.some(item =>
      item.kind === 'file' &&
      (item.type === 'text/plain' || item.type === 'application/x-holoscript')
    );

    if (hasHoloFile) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      const files = Array.from(e.dataTransfer.files);
      const holoFiles = files.filter(f => f.name.endsWith('.holo'));

      if (holoFiles.length === 0) {
        return;
      }

      for (const file of holoFiles) {
        processFile(file);
      }
    },
    [processFile]
  );

  return (
    <div
      className={className}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-studio-accent/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-studio-surface border-2 border-studio-accent rounded-2xl p-8 text-center shadow-2xl">
            <UploadCloud className="h-16 w-16 text-studio-accent mx-auto mb-4" />
            <p className="text-lg font-semibold text-studio-text">Drop .holo file here</p>
            <p className="text-sm text-studio-muted mt-2">Load HoloScript composition into scene</p>
          </div>
        </div>
      )}

      {/* Status toast */}
      {status.state !== 'idle' && (
        <div className="fixed bottom-4 right-4 bg-studio-surface border border-studio-border rounded-lg p-3 shadow-lg z-50">
          <div className="flex items-center gap-2">
            {status.state === 'parsing' && <Loader2 className="h-4 w-4 animate-spin text-studio-accent" />}
            {status.state === 'done' && <CheckCircle className="h-4 w-4 text-green-500" />}
            {status.state === 'error' && <FileText className="h-4 w-4 text-red-500" />}
            <div>
              <p className="text-xs font-medium text-studio-text">{status.fileName}</p>
              <p className="text-[10px] text-studio-muted">
                {status.message ||
                  (status.state === 'parsing' && 'Parsing...') ||
                  (status.state === 'done' && `Loaded ${status.objectCount} objects`) ||
                  (status.state === 'error' && 'Failed to load')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
