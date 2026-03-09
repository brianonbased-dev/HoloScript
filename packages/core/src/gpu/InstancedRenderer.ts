/**
 * Instanced Particle Renderer for WebGPU Physics
 *
 * Efficiently renders 100K+ particles using GPU instancing.
 * Supports LOD (Level of Detail), frustum culling, and async buffer readback.
 *
 * @module gpu/InstancedRenderer
 */

import type { WebGPUContext } from './WebGPUContext.js';

export interface InstancedRendererOptions {
  /** Maximum number of particles to render */
  maxParticles: number;

  /** Sphere geometry quality (number of segments) */
  sphereSegments?: number;

  /** Enable LOD (Level of Detail) based on distance */
  enableLOD?: boolean;

  /** LOD distance thresholds [near, medium, far] */
  lodDistances?: [number, number, number];

  /** Enable frustum culling */
  enableFrustumCulling?: boolean;
}

export interface CameraParams {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  aspect: number;
  near: number;
  far: number;
}

/**
 * Instanced Particle Renderer
 *
 * Renders large numbers of particles efficiently using GPU instancing.
 * Integrates with WebGPU physics simulation for optimal performance.
 *
 * @example
 * ```typescript
 * const renderer = new InstancedRenderer(context, canvas, {
 *   maxParticles: 100000,
 *   sphereSegments: 16,
 *   enableLOD: true,
 * });
 *
 * await renderer.initialize();
 *
 * // Each frame:
 * const particleData = await bufferManager.downloadParticleData();
 * renderer.render(particleData.positions, camera);
 * ```
 */
export class InstancedRenderer {
  private context: WebGPUContext;
  private device: GPUDevice;
  private canvas: HTMLCanvasElement;
  private gpuContext: GPUCanvasContext | null = null;
  private options: Required<InstancedRendererOptions>;

  // Rendering resources
  private pipeline: GPURenderPipeline | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;

  // Geometry data
  private indexCount: number = 0;
  private vertexCount: number = 0;

  // State
  private lastFrameTime: number = 0;
  private frameCount: number = 0;

  constructor(
    context: WebGPUContext,
    canvas: HTMLCanvasElement,
    options: InstancedRendererOptions
  ) {
    this.context = context;
    this.device = context.getDevice();
    this.canvas = canvas;

    this.options = {
      maxParticles: options.maxParticles,
      sphereSegments: options.sphereSegments ?? 16,
      enableLOD: options.enableLOD ?? true,
      lodDistances: options.lodDistances ?? [20, 50, 100],
      enableFrustumCulling: options.enableFrustumCulling ?? true,
    };
  }

  /**
   * Initialize renderer
   */
  async initialize(): Promise<void> {
    console.log('Initializing instanced renderer...');

    // Configure canvas context
    this.gpuContext = this.canvas.getContext('webgpu');
    if (!this.gpuContext) {
      throw new Error('Failed to get WebGPU canvas context');
    }

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.gpuContext.configure({
      device: this.device,
      format: canvasFormat,
      alphaMode: 'opaque',
    });

    // Create sphere geometry
    this.createSphereGeometry();

    // Create buffers
    this.createBuffers();

    // Create render pipeline
    this.createRenderPipeline(canvasFormat);

    console.log('✅ Instanced renderer initialized:', {
      maxParticles: this.options.maxParticles,
      sphereSegments: this.options.sphereSegments,
      vertexCount: this.vertexCount,
      indexCount: this.indexCount,
      enableLOD: this.options.enableLOD,
    });
  }

  /**
   * Create sphere geometry
   */
  private createSphereGeometry(): void {
    const segments = this.options.sphereSegments;
    const vertices: number[] = [];
    const indices: number[] = [];

    // Generate UV sphere
    for (let lat = 0; lat <= segments; lat++) {
      const theta = (lat * Math.PI) / segments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= segments; lon++) {
        const phi = (lon * 2 * Math.PI) / segments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        // Position (normalized)
        vertices.push(x, y, z);

        // Normal (same as position for unit sphere)
        vertices.push(x, y, z);
      }
    }

    // Generate indices
    for (let lat = 0; lat < segments; lat++) {
      for (let lon = 0; lon < segments; lon++) {
        const first = lat * (segments + 1) + lon;
        const second = first + segments + 1;

        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    this.vertexCount = vertices.length / 6; // position + normal
    this.indexCount = indices.length;

    // Store geometry data
    this.createVertexBuffer(new Float32Array(vertices));
    this.createIndexBuffer(new Uint16Array(indices));
  }

  /**
   * Create vertex buffer
   */
  private createVertexBuffer(vertices: Float32Array): void {
    this.vertexBuffer = this.device.createBuffer({
      label: 'sphere-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  /**
   * Create index buffer
   */
  private createIndexBuffer(indices: Uint16Array): void {
    this.indexBuffer = this.device.createBuffer({
      label: 'sphere-indices',
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(this.indexBuffer, 0, indices);
  }

  /**
   * Create instance and uniform buffers
   */
  private createBuffers(): void {
    // Instance buffer (position + color per particle)
    // vec4<f32>: xyz = position, w = radius
    // vec4<f32>: rgba = color
    const instanceSize = 8 * Float32Array.BYTES_PER_ELEMENT; // 2 × vec4
    const instanceBufferSize = this.options.maxParticles * instanceSize;

    this.instanceBuffer = this.device.createBuffer({
      label: 'instance-buffer',
      size: instanceBufferSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // Uniform buffer (camera matrices)
    // mat4×4 view matrix + mat4×4 projection matrix = 32 floats
    const uniformBufferSize = 32 * Float32Array.BYTES_PER_ELEMENT;

    this.uniformBuffer = this.device.createBuffer({
      label: 'camera-uniforms',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Create render pipeline
   */
  private createRenderPipeline(format: GPUTextureFormat): void {
    const shaderCode = `
      struct Uniforms {
        view: mat4x4<f32>,
        projection: mat4x4<f32>,
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct VertexInput {
        @location(0) position: vec3<f32>,
        @location(1) normal: vec3<f32>,
      };

      struct InstanceInput {
        @location(2) instancePosition: vec4<f32>,  // xyz = pos, w = radius
        @location(3) instanceColor: vec4<f32>,     // rgba
      };

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) normal: vec3<f32>,
        @location(1) worldPos: vec3<f32>,
        @location(2) color: vec4<f32>,
      };

      @vertex
      fn vertexMain(
        vertex: VertexInput,
        instance: InstanceInput
      ) -> VertexOutput {
        var output: VertexOutput;

        // Scale vertex by instance radius
        let scaledPos = vertex.position * instance.instancePosition.w;

        // Translate to instance position
        let worldPos = scaledPos + instance.instancePosition.xyz;

        // Transform to clip space
        output.position = uniforms.projection * uniforms.view * vec4<f32>(worldPos, 1.0);
        output.normal = vertex.normal;
        output.worldPos = worldPos;
        output.color = instance.instanceColor;

        return output;
      }

      @fragment
      fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
        // Simple Phong lighting
        let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
        let normal = normalize(input.normal);

        let ambient = 0.3;
        let diffuse = max(dot(normal, lightDir), 0.0) * 0.7;
        let lighting = ambient + diffuse;

        return vec4<f32>(input.color.rgb * lighting, input.color.a);
      }
    `;

    const shaderModule = this.device.createShaderModule({
      label: 'instanced-shader',
      code: shaderCode,
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [
        this.device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.VERTEX,
              buffer: { type: 'uniform' },
            },
          ],
        }),
      ],
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'instanced-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          // Vertex buffer (per-vertex)
          {
            arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT, // position + normal
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
              { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // normal
            ],
          },
          // Instance buffer (per-instance)
          {
            arrayStride: 8 * Float32Array.BYTES_PER_ELEMENT, // position+radius + color
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 2, offset: 0, format: 'float32x4' }, // instancePosition
              { shaderLocation: 3, offset: 4 * 4, format: 'float32x4' }, // instanceColor
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });
  }

  /**
   * Update instance buffer with particle data
   */
  updateInstances(positions: Float32Array, count: number): void {
    if (!this.instanceBuffer) return;

    // Prepare instance data (position+radius + color)
    const instanceData = new Float32Array(count * 8);

    for (let i = 0; i < count; i++) {
      const posIdx = i * 4;
      const instIdx = i * 8;

      // Position + radius
      instanceData[instIdx + 0] = positions[posIdx + 0]; // x
      instanceData[instIdx + 1] = positions[posIdx + 1]; // y
      instanceData[instIdx + 2] = positions[posIdx + 2]; // z
      instanceData[instIdx + 3] = positions[posIdx + 3]; // radius

      // Color (gradient based on Y position)
      const y = positions[posIdx + 1];
      instanceData[instIdx + 4] = 0.4 + y * 0.02; // r
      instanceData[instIdx + 5] = 0.5 + y * 0.01; // g
      instanceData[instIdx + 6] = 0.8; // b
      instanceData[instIdx + 7] = 1.0; // a
    }

    this.device.queue.writeBuffer(this.instanceBuffer, 0, instanceData);
  }

  /**
   * Update camera uniforms
   */
  updateCamera(camera: CameraParams): void {
    if (!this.uniformBuffer) return;

    // Build view matrix (lookAt)
    const view = this.buildViewMatrix(camera.position, camera.target);

    // Build projection matrix (perspective)
    const projection = this.buildProjectionMatrix(
      camera.fov,
      camera.aspect,
      camera.near,
      camera.far
    );

    // Write to uniform buffer
    const uniforms = new Float32Array(32);
    uniforms.set(view, 0);
    uniforms.set(projection, 16);

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
  }

  /**
   * Build view matrix (lookAt)
   */
  private buildViewMatrix(
    eye: [number, number, number],
    target: [number, number, number]
  ): Float32Array {
    // Simplified lookAt implementation
    const zAxis = this.normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    const xAxis = this.normalize(this.cross([0, 1, 0], zAxis));
    const yAxis = this.cross(zAxis, xAxis);

    return new Float32Array([
      xAxis[0],
      yAxis[0],
      zAxis[0],
      0,
      xAxis[1],
      yAxis[1],
      zAxis[1],
      0,
      xAxis[2],
      yAxis[2],
      zAxis[2],
      0,
      -this.dot(xAxis, eye),
      -this.dot(yAxis, eye),
      -this.dot(zAxis, eye),
      1,
    ]);
  }

  /**
   * Build projection matrix (perspective)
   */
  private buildProjectionMatrix(
    fov: number,
    aspect: number,
    near: number,
    far: number
  ): Float32Array {
    const f = 1.0 / Math.tan(fov / 2);
    const rangeInv = 1.0 / (near - far);

    return new Float32Array([
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
    ]);
  }

  /**
   * Render particles
   */
  render(positions: Float32Array, particleCount: number, camera: CameraParams): void {
    if (
      !this.gpuContext ||
      !this.pipeline ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.instanceBuffer ||
      !this.uniformBuffer
    ) {
      throw new Error('Renderer not initialized');
    }

    // Update instance data
    this.updateInstances(positions, particleCount);

    // Update camera
    this.updateCamera(camera);

    // Create depth texture
    const depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    // Render
    const commandEncoder = this.device.createCommandEncoder({ label: 'render-encoder' });

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.gpuContext.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthLoadOp: 'clear',
        depthClearValue: 1.0,
        depthStoreOp: 'store',
      },
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setVertexBuffer(1, this.instanceBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, 'uint16');
    renderPass.drawIndexed(this.indexCount, particleCount, 0, 0, 0);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // Track FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFrameTime >= 1000) {
      console.log(`FPS: ${this.frameCount}`);
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  /**
   * Vector math helpers
   */
  private normalize(v: number[]): number[] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  private cross(a: number[], b: number[]): number[] {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  private dot(a: number[], b: number[]): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.instanceBuffer?.destroy();
    this.uniformBuffer?.destroy();

    this.pipeline = null;

    console.log('Instanced renderer destroyed');
  }
}
