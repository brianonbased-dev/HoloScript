/**
 * Splat Renderer WGSL
 *
 * Implements Gaussian Splatting rasterization.
 * Projects 3D ellipsoids into 2D screen space with Gaussian falloff.
 */

struct Uniforms {
    viewProjection : mat4x4<f32>,
    cameraPosition : vec3<f32>,
    screenDimensions : vec2<f32>,
};

struct Splat {
    pos : vec3<f32>,
    scale : vec3<f32>,
    rot : vec4<f32>,
    color : vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> splats : array<Splat>;
@group(0) @binding(2) var<storage, read> indices : array<u32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) color : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) conic : vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex : u32, @builtin(instance_index) instanceIndex : u32) -> VertexOutput {
    let splatIndex = indices[instanceIndex];
    let splat = splats[splatIndex];

    // Billboarding logic: create a quad
    let uv = vec2<f32>(f32(vertexIndex % 2), f32(vertexIndex / 2)) * 2.0 - 1.0;
    
    // Project position
    let worldPos = vec4<f32>(splat.pos, 1.0);
    let clipPos = uniforms.viewProjection * worldPos;
    
    // Simple point expansion for now (full ellipsoid projection is more complex)
    // In a real implementation, we'd calculate the 2D covariance matrix here.
    let size = 0.05 * splat.scale.x; 
    let offset = vec4<f32>(uv * size, 0.0, 0.0);
    
    var out : VertexOutput;
    out.position = clipPos + offset;
    out.color = splat.color;
    out.uv = uv;
    out.conic = vec3<f32>(1.0, 0.0, 1.0); // Dummy conic
    
    return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
    // Gaussian falloff
    let d = dot(in.uv, in.uv);
    let alpha = exp(-2.0 * d) * in.color.a;
    
    if (alpha < 0.01) {
        discard;
    }
    
    return vec4<f32>(in.color.rgb, alpha);
}
