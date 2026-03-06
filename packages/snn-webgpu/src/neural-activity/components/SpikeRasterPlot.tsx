/**
 * SpikeRasterPlot
 *
 * Renders a time-series scatter plot of spike events across neuron populations.
 * Each dot represents a single spike: X-axis is time, Y-axis is neuron index.
 * Different populations are color-coded.
 *
 * Uses WebGPU for rendering with Canvas 2D fallback.
 */

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import type { BaseVisualizationProps, SpikeEvent, TimeWindow } from '../types';
import { useWebGPU } from '../hooks/useWebGPU';
import { useAnimationLoop } from '../hooks/useAnimationLoop';
import { createShaderModule, createBuffer, writeBuffer } from '../webgpu-utils';
import { rasterVertexShader, rasterFragmentShader } from '../shaders/raster.wgsl';

/** Population color palette matching the shader. */
const POPULATION_COLORS: Record<number, string> = {
  0: 'rgb(31, 119, 180)',  // blue
  1: 'rgb(255, 127, 14)',  // orange
  2: 'rgb(44, 160, 44)',   // green
  3: 'rgb(214, 39, 40)',   // red
};

export interface SpikeRasterPlotProps extends BaseVisualizationProps {
  /** Spike events to render. */
  spikes: SpikeEvent[];
  /** Visible time window. */
  timeWindow: TimeWindow;
  /** Total number of neurons across all populations. */
  neuronCount: number;
  /** Point size in pixels. */
  pointSize?: number;
  /** Unique population IDs for the legend. */
  populationIds?: string[];
  /** Whether to render axis labels. */
  showAxes?: boolean;
  /** Callback when a spike is clicked (nearest spike within threshold). */
  onSpikeClick?: (spike: SpikeEvent) => void;
}

/** Map population IDs to sequential indices. */
function buildPopulationMap(spikes: SpikeEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 0;
  for (const s of spikes) {
    if (!map.has(s.populationId)) {
      map.set(s.populationId, idx++);
    }
  }
  return map;
}

export const SpikeRasterPlot: React.FC<SpikeRasterPlotProps> = ({
  width,
  height,
  spikes,
  timeWindow,
  neuronCount,
  pointSize = 3,
  populationIds,
  showAxes = true,
  className,
  ariaLabel = 'Spike raster plot',
  onSpikeClick,
}) => {
  const { gpuContext, canvasRef, isSupported, error, isLoading } = useWebGPU(width, height);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineRef = useRef<GPURenderPipeline | null>(null);
  const spikeBufferRef = useRef<GPUBuffer | null>(null);
  const uniformBufferRef = useRef<GPUBuffer | null>(null);
  const bindGroupRef = useRef<GPUBindGroup | null>(null);
  const spikeCountRef = useRef(0);

  const populationMap = useMemo(() => buildPopulationMap(spikes), [spikes]);

  // Pack spike data into a GPU-friendly format
  const packedSpikes = useMemo(() => {
    const data = new Float32Array(spikes.length * 4);
    for (let i = 0; i < spikes.length; i++) {
      const s = spikes[i];
      data[i * 4 + 0] = s.neuronIndex;
      data[i * 4 + 1] = s.timestampMs;
      data[i * 4 + 2] = populationMap.get(s.populationId) ?? 0;
      data[i * 4 + 3] = 0; // padding
    }
    return data;
  }, [spikes, populationMap]);

  // Initialize GPU pipeline
  useEffect(() => {
    if (!gpuContext) return;
    const { device, format } = gpuContext;

    const vertModule = createShaderModule(device, rasterVertexShader, 'raster-vertex');
    const fragModule = createShaderModule(device, rasterFragmentShader, 'raster-fragment');

    const uniformData = new Float32Array([
      timeWindow.startMs,
      timeWindow.endMs,
      neuronCount,
      pointSize,
    ]);
    const uniformBuffer = createBuffer(
      device,
      uniformData.byteLength,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      uniformData,
      'raster-uniforms',
    );
    uniformBufferRef.current = uniformBuffer;

    const spikeByteSize = Math.max(packedSpikes.byteLength, 16);
    const spikeBuffer = createBuffer(
      device,
      spikeByteSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      packedSpikes.byteLength > 0 ? packedSpikes : undefined,
      'raster-spikes',
    );
    spikeBufferRef.current = spikeBuffer;
    spikeCountRef.current = spikes.length;

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: spikeBuffer } },
      ],
    });
    bindGroupRef.current = bindGroup;

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: vertModule, entryPoint: 'main' },
      fragment: {
        module: fragModule,
        entryPoint: 'main',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });
    pipelineRef.current = pipeline;
  }, [gpuContext, timeWindow, neuronCount, pointSize, packedSpikes, spikes.length]);

  // Update spike data
  useEffect(() => {
    if (!gpuContext || !spikeBufferRef.current || packedSpikes.byteLength === 0) return;

    // If the buffer is too small, we skip (pipeline re-init will handle it)
    if (packedSpikes.byteLength <= spikeBufferRef.current.size) {
      writeBuffer(gpuContext.device, spikeBufferRef.current, packedSpikes);
      spikeCountRef.current = spikes.length;
    }
  }, [gpuContext, packedSpikes, spikes.length]);

  // Update uniforms
  useEffect(() => {
    if (!gpuContext || !uniformBufferRef.current) return;
    const uniformData = new Float32Array([
      timeWindow.startMs,
      timeWindow.endMs,
      neuronCount,
      pointSize,
    ]);
    writeBuffer(gpuContext.device, uniformBufferRef.current, uniformData);
  }, [gpuContext, timeWindow, neuronCount, pointSize]);

  // WebGPU render
  const renderWebGPU = useCallback(() => {
    if (!gpuContext || !pipelineRef.current || !bindGroupRef.current) return;
    if (spikeCountRef.current === 0) return;

    const { device, context } = gpuContext;
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1.0 },
          loadOp: 'clear' as GPULoadOp,
          storeOp: 'store' as GPUStoreOp,
        },
      ],
    });

    renderPass.setPipeline(pipelineRef.current);
    renderPass.setBindGroup(0, bindGroupRef.current);
    renderPass.draw(6, spikeCountRef.current);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }, [gpuContext]);

  useAnimationLoop(renderWebGPU, {
    enabled: !!gpuContext && !!pipelineRef.current && spikeCountRef.current > 0,
    targetFps: 60,
  });

  // Canvas 2D fallback
  useEffect(() => {
    if (isSupported && !error) return;
    const canvas = fallbackCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = 'rgb(5, 5, 13)';
    ctx.fillRect(0, 0, width, height);

    const timeDuration = timeWindow.endMs - timeWindow.startMs;
    if (timeDuration <= 0) return;

    for (const spike of spikes) {
      const x = ((spike.timestampMs - timeWindow.startMs) / timeDuration) * width;
      const y = (spike.neuronIndex / neuronCount) * height;
      const popIdx = populationMap.get(spike.populationId) ?? 0;

      ctx.fillStyle = POPULATION_COLORS[popIdx % 4] ?? POPULATION_COLORS[0];
      ctx.beginPath();
      ctx.arc(x, y, pointSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Axes
    if (showAxes) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(width, height);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, height);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '10px monospace';
      ctx.fillText(`${timeWindow.startMs.toFixed(0)}ms`, 4, height - 4);
      ctx.fillText(`${timeWindow.endMs.toFixed(0)}ms`, width - 50, height - 4);
      ctx.fillText('Neuron 0', 4, 12);
      ctx.fillText(`Neuron ${neuronCount}`, 4, height - 16);
    }
  }, [isSupported, error, width, height, spikes, timeWindow, neuronCount, pointSize, populationMap, showAxes]);

  // Click handler: find nearest spike
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSpikeClick || spikes.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const timeDuration = timeWindow.endMs - timeWindow.startMs;
      const clickTimeMs = timeWindow.startMs + (mx / width) * timeDuration;
      const clickNeuron = (my / height) * neuronCount;

      let nearest: SpikeEvent | null = null;
      let bestDist = Infinity;

      for (const spike of spikes) {
        const dt = ((spike.timestampMs - clickTimeMs) / timeDuration) * width;
        const dn = ((spike.neuronIndex - clickNeuron) / neuronCount) * height;
        const dist = dt * dt + dn * dn;
        if (dist < bestDist) {
          bestDist = dist;
          nearest = spike;
        }
      }

      if (nearest && bestDist < 100) {
        onSpikeClick(nearest);
      }
    },
    [onSpikeClick, spikes, timeWindow, width, height, neuronCount],
  );

  if (isLoading) {
    return (
      <div
        className={className}
        role="status"
        aria-label="Loading raster plot"
        style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a1a' }}
      >
        <span style={{ color: '#ccc' }}>Initializing WebGPU...</span>
      </div>
    );
  }

  const useWebGPUPath = isSupported && !error;
  const uniquePops = populationIds ?? [...populationMap.keys()];

  return (
    <div className={className} style={{ position: 'relative', display: 'inline-block' }}>
      {useWebGPUPath ? (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onClick={handleClick}
          style={{ display: 'block' }}
          data-testid="raster-canvas"
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
          data-testid="raster-canvas-fallback"
        />
      )}

      {/* Population legend */}
      {uniquePops.length > 0 && (
        <div
          role="list"
          aria-label="Population legend"
          data-testid="raster-legend"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0,0,0,0.7)',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '11px',
          }}
        >
          {uniquePops.map((popId, i) => (
            <div key={popId} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 2 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: POPULATION_COLORS[i % 4],
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#ddd' }}>{popId}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
