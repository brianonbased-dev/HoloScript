import { WebGPUContext } from './WebGPUContext';
import { REGULAR_GRID_STENCIL_WGSL } from './shaders/regular_grid_stencils';

interface GridShape {
  nx: number;
  ny: number;
  nz: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface ThermalStencilParams extends GridShape {
  dt: number;
  alpha: number;
  rhoCp: number;
}

export interface AcousticStencilParams extends GridShape {
  dt: number;
  cUniform: number;
  hasVelocity: boolean;
}

export class RegularGridStencilSolver {
  private context: WebGPUContext;
  private thermalPipeline: GPUComputePipeline | null = null;
  private acousticPipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;

  constructor(context = new WebGPUContext({ fallbackToCPU: true })) {
    this.context = context;
  }

  async initialize(): Promise<boolean> {
    await this.context.initialize();
    if (!this.context.isSupported()) return false;

    const device = this.context.getDevice();
    const module = device.createShaderModule({
      label: 'regular-grid-stencils',
      code: REGULAR_GRID_STENCIL_WGSL,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'regular-grid-stencil-bindings',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const layout = device.createPipelineLayout({
      label: 'regular-grid-stencil-pipeline-layout',
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.thermalPipeline = device.createComputePipeline({
      label: 'thermal-explicit-stencil',
      layout,
      compute: { module, entryPoint: 'thermal_explicit' },
    });

    this.acousticPipeline = device.createComputePipeline({
      label: 'acoustic-leapfrog-stencil',
      layout,
      compute: { module, entryPoint: 'acoustic_leapfrog' },
    });

    return true;
  }

  async stepThermalExplicit(
    temperature: Float32Array,
    source: Float32Array,
    params: ThermalStencilParams,
  ): Promise<Float32Array | null> {
    if (!(await this.ensureReady()) || !this.thermalPipeline) return null;
    const zero = new Float32Array(temperature.length);
    return this.dispatch(this.thermalPipeline, temperature, zero, source, {
      ...params,
      cUniform: 0,
      hasVelocity: false,
    });
  }

  async stepAcousticLeapfrog(
    current: Float32Array,
    previous: Float32Array,
    velocity: Float32Array | null,
    params: AcousticStencilParams,
  ): Promise<Float32Array | null> {
    if (!(await this.ensureReady()) || !this.acousticPipeline) return null;
    const aux = velocity ?? new Float32Array(current.length);
    return this.dispatch(this.acousticPipeline, current, previous, aux, {
      ...params,
      alpha: 0,
      rhoCp: 1,
    });
  }

  destroy(): void {
    this.thermalPipeline = null;
    this.acousticPipeline = null;
    this.bindGroupLayout = null;
  }

  private async ensureReady(): Promise<boolean> {
    if (this.thermalPipeline && this.acousticPipeline && this.bindGroupLayout) {
      return true;
    }
    return this.initialize();
  }

  private async dispatch(
    pipeline: GPUComputePipeline,
    inputA: Float32Array,
    inputB: Float32Array,
    aux: Float32Array,
    params: ThermalStencilParams & { cUniform: number; hasVelocity: boolean } | AcousticStencilParams & { alpha: number; rhoCp: number },
  ): Promise<Float32Array> {
    const device = this.context.getDevice();
    const n = params.nx * params.ny * params.nz;
    const byteLength = n * Float32Array.BYTES_PER_ELEMENT;

    if (inputA.length !== n || inputB.length !== n || aux.length !== n) {
      throw new Error(`RegularGridStencilSolver expected ${n} cells, got ${inputA.length}/${inputB.length}/${aux.length}`);
    }

    const bufferA = this.createStorageBuffer('stencil-input-a', inputA, GPUBufferUsage.COPY_DST);
    const bufferB = this.createStorageBuffer('stencil-input-b', inputB, GPUBufferUsage.COPY_DST);
    const bufferAux = this.createStorageBuffer('stencil-aux', aux, GPUBufferUsage.COPY_DST);
    const bufferOut = device.createBuffer({
      label: 'stencil-output',
      size: byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const paramsBuffer = device.createBuffer({
      label: 'stencil-params',
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const readback = device.createBuffer({
      label: 'stencil-readback',
      size: byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(paramsBuffer, 0, this.packParams(params));

    const bindGroup = device.createBindGroup({
      label: 'regular-grid-stencil-bind-group',
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: bufferA } },
        { binding: 1, resource: { buffer: bufferB } },
        { binding: 2, resource: { buffer: bufferAux } },
        { binding: 3, resource: { buffer: bufferOut } },
        { binding: 4, resource: { buffer: paramsBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder({ label: 'regular-grid-stencil-encoder' });
    const pass = encoder.beginComputePass({ label: 'regular-grid-stencil-pass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(n / 128));
    pass.end();
    encoder.copyBufferToBuffer(bufferOut, 0, readback, 0, byteLength);
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ, 0, byteLength);
    const out = new Float32Array(readback.getMappedRange(0, byteLength).slice(0));
    readback.unmap();

    bufferA.destroy();
    bufferB.destroy();
    bufferAux.destroy();
    bufferOut.destroy();
    paramsBuffer.destroy();
    readback.destroy();

    return out;
  }

  private createStorageBuffer(label: string, data: Float32Array, extraUsage: GPUBufferUsageFlags): GPUBuffer {
    const device = this.context.getDevice();
    const upload = new Float32Array(data);
    const buffer = device.createBuffer({
      label,
      size: upload.byteLength,
      usage: GPUBufferUsage.STORAGE | extraUsage,
    });
    device.queue.writeBuffer(buffer, 0, upload);
    return buffer;
  }

  private packParams(
    params: ThermalStencilParams & { cUniform: number; hasVelocity: boolean } | AcousticStencilParams & { alpha: number; rhoCp: number },
  ): ArrayBuffer {
    const buffer = new ArrayBuffer(48);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);
    u32[0] = params.nx;
    u32[1] = params.ny;
    u32[2] = params.nz;
    u32[3] = params.hasVelocity ? 1 : 0;
    f32[4] = params.dx;
    f32[5] = params.dy;
    f32[6] = params.dz;
    f32[7] = params.dt;
    f32[8] = 'alpha' in params ? params.alpha : 0;
    f32[9] = 'rhoCp' in params ? params.rhoCp : 1;
    f32[10] = params.cUniform;
    f32[11] = 0;
    return buffer;
  }
}
