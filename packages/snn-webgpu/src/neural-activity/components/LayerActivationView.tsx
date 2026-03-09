/**
 * LayerActivationView
 *
 * Renders a 3D visualization of activation patterns across SNN layers.
 * Each layer is rendered as a 2D plane stacked along the Y-axis, with
 * neuron activation values controlling height displacement and color.
 *
 * Supports rotation via mouse drag and uses a simple perspective projection.
 * Falls back to stacked 2D grids when WebGPU is unavailable.
 */

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { BaseVisualizationProps, LayerActivation } from '../types';
import { useWebGPU } from '../hooks/useWebGPU';
import { useAnimationLoop } from '../hooks/useAnimationLoop';
import { createShaderModule, createBuffer, writeBuffer, colorMapLookup } from '../webgpu-utils';
import { layer3dVertexShader, layer3dFragmentShader } from '../shaders/layer3d.wgsl';

export interface LayerActivationViewProps extends BaseVisualizationProps {
  /** Layer activation data for all layers. */
  layers: LayerActivation[];
  /** Which layer index to highlight (or -1 for none). */
  selectedLayer?: number;
  /** Whether user can rotate the 3D view. */
  enableRotation?: boolean;
  /** Callback when a layer is clicked. */
  onLayerSelect?: (layerIndex: number) => void;
}

/**
 * Build a simple perspective * rotation view-projection matrix.
 * Returns a Float32Array of 16 elements (column-major 4x4).
 */
function buildViewProjection(
  rotationX: number,
  rotationY: number,
  distance: number,
  aspect: number
): Float32Array {
  const fov = Math.PI / 4;
  const near = 0.1;
  const far = 100;

  // Perspective
  const f = 1 / Math.tan(fov / 2);
  const rangeInv = 1 / (near - far);

  const proj = [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (near + far) * rangeInv,
    -1,
    0,
    0,
    near * far * rangeInv * 2,
    0,
  ];

  // Rotation
  const cx = Math.cos(rotationX);
  const sx = Math.sin(rotationX);
  const cy = Math.cos(rotationY);
  const sy = Math.sin(rotationY);

  const rotX = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1];

  const rotY = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];

  const translate = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1];

  // Multiply: proj * translate * rotX * rotY
  const result = mat4Multiply(mat4Multiply(mat4Multiply(proj, translate), rotX), rotY);
  return new Float32Array(result);
}

function mat4Multiply(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        out[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
      }
    }
  }
  return out;
}

export const LayerActivationView: React.FC<LayerActivationViewProps> = ({
  width,
  height,
  layers,
  selectedLayer = -1,
  enableRotation = true,
  className,
  ariaLabel = 'Layer activation 3D view',
  onLayerSelect,
}) => {
  const { gpuContext, canvasRef, isSupported, error, isLoading } = useWebGPU(width, height);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineRef = useRef<GPURenderPipeline | null>(null);
  const uniformBufferRef = useRef<GPUBuffer | null>(null);
  const activationBufferRef = useRef<GPUBuffer | null>(null);
  const bindGroupLayoutRef = useRef<GPUBindGroupLayout | null>(null);

  const [rotationX, setRotationX] = useState(-0.5);
  const [rotationY, setRotationY] = useState(0.4);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const aspect = width / height;
  const distance = 5;

  // Build the view-projection matrix
  const viewProjection = useMemo(
    () => buildViewProjection(rotationX, rotationY, distance, aspect),
    [rotationX, rotationY, distance, aspect]
  );

  // Initialize pipeline (once)
  useEffect(() => {
    if (!gpuContext) return;
    const { device, format } = gpuContext;

    const vertModule = createShaderModule(device, layer3dVertexShader, 'layer3d-vertex');
    const fragModule = createShaderModule(device, layer3dFragmentShader, 'layer3d-fragment');

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    bindGroupLayoutRef.current = bindGroupLayout;

    // Uniform buffer: mat4x4 + layerIndex, layerCount, rows, cols (16 + 4 = 20 floats, padded to 80 bytes)
    const uniformBuffer = createBuffer(
      device,
      80,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      undefined,
      'layer3d-uniforms'
    );
    uniformBufferRef.current = uniformBuffer;

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: vertModule, entryPoint: 'main' },
      fragment: {
        module: fragModule,
        entryPoint: 'main',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });
    pipelineRef.current = pipeline;
  }, [gpuContext]);

  // WebGPU render: draw each layer as a separate draw call
  const renderWebGPU = useCallback(() => {
    if (!gpuContext || !pipelineRef.current || !bindGroupLayoutRef.current || layers.length === 0)
      return;

    const { device, context } = gpuContext;
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.03, g: 0.03, b: 0.08, a: 1.0 },
          loadOp: 'clear' as GPULoadOp,
          storeOp: 'store' as GPUStoreOp,
        },
      ],
    });

    renderPass.setPipeline(pipelineRef.current);

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      const neuronCount = layer.dimensions.rows * layer.dimensions.cols;

      // Write uniform data for this layer
      const uniformData = new Float32Array(20);
      uniformData.set(viewProjection, 0);
      uniformData[16] = layerIdx;
      uniformData[17] = layers.length;
      uniformData[18] = layer.dimensions.rows;
      uniformData[19] = layer.dimensions.cols;
      writeBuffer(device, uniformBufferRef.current!, uniformData);

      // Activation buffer for this layer
      const actBuffer = createBuffer(
        device,
        Math.max(layer.activations.byteLength, 16),
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        layer.activations,
        `layer3d-act-${layerIdx}`
      );

      const bindGroup = device.createBindGroup({
        layout: bindGroupLayoutRef.current!,
        entries: [
          { binding: 0, resource: { buffer: uniformBufferRef.current! } },
          { binding: 1, resource: { buffer: actBuffer } },
        ],
      });

      renderPass.setBindGroup(0, bindGroup);
      renderPass.draw(6, neuronCount);

      // Note: actBuffer will be garbage collected. For production, pool these buffers.
    }

    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }, [gpuContext, layers, viewProjection]);

  useAnimationLoop(renderWebGPU, {
    enabled: !!gpuContext && !!pipelineRef.current && layers.length > 0,
    targetFps: 60,
  });

  // Canvas 2D fallback: draw stacked 2D grids
  useEffect(() => {
    if (isSupported && !error) return;
    const canvas = fallbackCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = 'rgb(8, 8, 20)';
    ctx.fillRect(0, 0, width, height);

    if (layers.length === 0) return;

    const layerHeight = height / layers.length;
    const margin = 4;

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const yOffset = li * layerHeight + margin;
      const availH = layerHeight - margin * 2;
      const { rows, cols } = layer.dimensions;
      const cellW = width / cols;
      const cellH = availH / rows;

      // Highlight selected layer
      if (li === selectedLayer) {
        ctx.strokeStyle = 'rgba(255, 200, 50, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, yOffset - margin, width, layerHeight);
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const act = layer.activations[idx] ?? 0;
          const [cr, cg, cb] = colorMapLookup('viridis', act);
          ctx.fillStyle = `rgb(${Math.round(cr * 255)}, ${Math.round(cg * 255)}, ${Math.round(cb * 255)})`;
          ctx.fillRect(c * cellW, yOffset + r * cellH, cellW, cellH);
        }
      }

      // Layer label
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px monospace';
      ctx.fillText(layer.layerName, 4, yOffset + 12);
    }
  }, [isSupported, error, width, height, layers, selectedLayer]);

  // Mouse drag for rotation
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!enableRotation) return;
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    },
    [enableRotation]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };

    setRotationY((prev) => prev + dx * 0.005);
    setRotationX((prev) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev + dy * 0.005)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Click to select layer (simplified: divide canvas vertically)
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onLayerSelect || layers.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const layerIdx = Math.floor((y / height) * layers.length);
      if (layerIdx >= 0 && layerIdx < layers.length) {
        onLayerSelect(layerIdx);
      }
    },
    [onLayerSelect, layers, height]
  );

  if (isLoading) {
    return (
      <div
        className={className}
        role="status"
        aria-label="Loading 3D layer view"
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a1e',
        }}
      >
        <span style={{ color: '#ccc' }}>Initializing WebGPU...</span>
      </div>
    );
  }

  const useWebGPUPath = isSupported && !error;

  return (
    <div className={className} style={{ position: 'relative', display: 'inline-block' }}>
      {useWebGPUPath ? (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          style={{ display: 'block', cursor: enableRotation ? 'grab' : 'default' }}
          data-testid="layer3d-canvas"
        />
      ) : (
        <canvas
          ref={fallbackCanvasRef}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onClick={handleClick}
          style={{ display: 'block' }}
          data-testid="layer3d-canvas-fallback"
        />
      )}

      {/* Layer labels overlay */}
      <div
        data-testid="layer-labels"
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'rgba(0,0,0,0.6)',
          padding: '6px 10px',
          borderRadius: '4px',
          fontSize: '10px',
          color: '#ccc',
          maxHeight: height - 16,
          overflowY: 'auto',
        }}
      >
        {layers.map((layer, i) => (
          <div
            key={layer.layerId}
            style={{
              padding: '2px 0',
              fontWeight: i === selectedLayer ? 'bold' : 'normal',
              color: i === selectedLayer ? '#ffc832' : '#ccc',
              cursor: 'pointer',
            }}
            role="button"
            tabIndex={0}
            aria-label={`Select layer ${layer.layerName}`}
            onClick={() => onLayerSelect?.(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onLayerSelect?.(i);
              }
            }}
          >
            {layer.layerName}
          </div>
        ))}
      </div>
    </div>
  );
};
