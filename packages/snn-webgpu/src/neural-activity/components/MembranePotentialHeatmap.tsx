/**
 * MembranePotentialHeatmap
 *
 * Renders a 2D grid of neuron membrane voltages as a color-mapped heatmap
 * using WebGPU. Each cell represents one neuron; color encodes voltage level.
 *
 * Falls back to a Canvas 2D rendering path when WebGPU is unavailable.
 */

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import type { BaseVisualizationProps, ColorMap } from '../types';
import { useWebGPU } from '../hooks/useWebGPU';
import { useAnimationLoop } from '../hooks/useAnimationLoop';
import {
  createShaderModule,
  createBuffer,
  writeBuffer,
  generateColorMapData,
  normalizeVoltage,
  colorMapLookup,
} from '../webgpu-utils';
import { heatmapVertexShader, heatmapFragmentShader } from '../shaders/heatmap.wgsl';

export interface MembranePotentialHeatmapProps extends BaseVisualizationProps {
  /** Membrane potentials as a flat array (row-major). */
  voltages: Float32Array;
  /** Grid dimensions. */
  gridRows: number;
  /** Grid columns. */
  gridCols: number;
  /** Color map configuration. */
  colorMap?: ColorMap;
  /** Whether to show voltage value tooltips on hover. */
  showTooltips?: boolean;
  /** Callback when a neuron cell is clicked. */
  onNeuronClick?: (neuronIndex: number, voltage: number) => void;
}

export const MembranePotentialHeatmap: React.FC<MembranePotentialHeatmapProps> = ({
  width,
  height,
  voltages,
  gridRows,
  gridCols,
  colorMap = { name: 'viridis', minValue: -80, maxValue: 40 },
  className,
  ariaLabel = 'Membrane potential heatmap',
  showTooltips = true,
  onNeuronClick,
}) => {
  const { gpuContext, canvasRef, isSupported, error, isLoading } = useWebGPU(width, height);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineRef = useRef<GPURenderPipeline | null>(null);
  const voltageBufferRef = useRef<GPUBuffer | null>(null);
  const uniformBufferRef = useRef<GPUBuffer | null>(null);
  const colorMapBufferRef = useRef<GPUBuffer | null>(null);
  const bindGroupRef = useRef<GPUBindGroup | null>(null);
  const [tooltipInfo, setTooltipInfo] = React.useState<{
    x: number;
    y: number;
    neuronIndex: number;
    voltage: number;
  } | null>(null);

  const neuronCount = gridRows * gridCols;

  // Normalize voltages for GPU
  const normalizedVoltages = useMemo(() => {
    const normed = new Float32Array(voltages.length);
    for (let i = 0; i < voltages.length; i++) {
      normed[i] = normalizeVoltage(voltages[i], colorMap.minValue, colorMap.maxValue);
    }
    return normed;
  }, [voltages, colorMap.minValue, colorMap.maxValue]);

  // Initialize GPU pipeline
  useEffect(() => {
    if (!gpuContext) return;
    const { device, format } = gpuContext;

    const vertexModule = createShaderModule(device, heatmapVertexShader, 'heatmap-vertex');
    const fragmentModule = createShaderModule(device, heatmapFragmentShader, 'heatmap-fragment');

    // Uniform buffer: gridRows, gridCols, canvasWidth, canvasHeight
    const uniformData = new Float32Array([gridRows, gridCols, width, height]);
    const uniformBuffer = createBuffer(
      device,
      uniformData.byteLength,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      uniformData,
      'heatmap-uniforms'
    );
    uniformBufferRef.current = uniformBuffer;

    // Voltage data buffer
    const voltageBuffer = createBuffer(
      device,
      Math.max(neuronCount * 4, 16),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      normalizedVoltages,
      'heatmap-voltages'
    );
    voltageBufferRef.current = voltageBuffer;

    // Color map LUT buffer
    const colorMapData = generateColorMapData(colorMap);
    const colorMapBuffer = createBuffer(
      device,
      colorMapData.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      colorMapData,
      'heatmap-colormap'
    );
    colorMapBufferRef.current = colorMapBuffer;

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: voltageBuffer } },
        { binding: 2, resource: { buffer: colorMapBuffer } },
      ],
    });
    bindGroupRef.current = bindGroup;

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'main',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });
    pipelineRef.current = pipeline;
  }, [gpuContext, gridRows, gridCols, width, height, colorMap, neuronCount, normalizedVoltages]);

  // Update voltage buffer on data change
  useEffect(() => {
    if (!gpuContext || !voltageBufferRef.current) return;
    writeBuffer(gpuContext.device, voltageBufferRef.current, normalizedVoltages);
  }, [gpuContext, normalizedVoltages]);

  // WebGPU render callback
  const renderWebGPU = useCallback(() => {
    if (!gpuContext || !pipelineRef.current || !bindGroupRef.current) return;

    const { device, context } = gpuContext;
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
          loadOp: 'clear' as GPULoadOp,
          storeOp: 'store' as GPUStoreOp,
        },
      ],
    });

    renderPass.setPipeline(pipelineRef.current);
    renderPass.setBindGroup(0, bindGroupRef.current);
    renderPass.draw(6, neuronCount); // 6 verts per quad, one quad per neuron
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }, [gpuContext, neuronCount]);

  // Animation loop for WebGPU
  useAnimationLoop(renderWebGPU, {
    enabled: !!gpuContext && !!pipelineRef.current,
    targetFps: 60,
  });

  // Canvas 2D fallback rendering
  useEffect(() => {
    if (isSupported && !error) return; // WebGPU is handling it
    const canvas = fallbackCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const cellW = width / gridCols;
    const cellH = height / gridRows;

    ctx.clearRect(0, 0, width, height);

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const idx = row * gridCols + col;
        const v = normalizedVoltages[idx] ?? 0;
        const [r, g, b] = colorMapLookup(colorMap.name, v);
        ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
      }
    }
  }, [isSupported, error, width, height, gridRows, gridCols, normalizedVoltages, colorMap.name]);

  // Mouse interaction for tooltips and clicks
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!showTooltips) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.floor((x / width) * gridCols);
      const row = Math.floor((y / height) * gridRows);
      const idx = row * gridCols + col;

      if (idx >= 0 && idx < voltages.length) {
        setTooltipInfo({ x: e.clientX, y: e.clientY, neuronIndex: idx, voltage: voltages[idx] });
      }
    },
    [showTooltips, width, height, gridRows, gridCols, voltages]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipInfo(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onNeuronClick) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.floor((x / width) * gridCols);
      const row = Math.floor((y / height) * gridRows);
      const idx = row * gridCols + col;

      if (idx >= 0 && idx < voltages.length) {
        onNeuronClick(idx, voltages[idx]);
      }
    },
    [onNeuronClick, width, height, gridRows, gridCols, voltages]
  );

  if (isLoading) {
    return (
      <div
        className={className}
        role="status"
        aria-label="Loading heatmap"
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a2e',
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
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ display: 'block' }}
          data-testid="heatmap-canvas"
        />
      ) : (
        <canvas
          ref={fallbackCanvasRef}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ display: 'block' }}
          data-testid="heatmap-canvas-fallback"
        />
      )}

      {tooltipInfo && (
        <div
          role="tooltip"
          data-testid="heatmap-tooltip"
          style={{
            position: 'fixed',
            left: tooltipInfo.x + 12,
            top: tooltipInfo.y - 28,
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'nowrap',
          }}
        >
          Neuron {tooltipInfo.neuronIndex}: {tooltipInfo.voltage.toFixed(1)} mV
        </div>
      )}
    </div>
  );
};
