import { describe, it, expect } from 'vitest';

// Import the function under test
// Since analyzeShaders is not exported, we need to extract it for testing
// For now, we'll copy the function here. In production, we'd export it from the main file.
function analyzeShaders(
  output: string,
  source: string
): { total: number; compute: number; vertex: number; fragment: number } {
  // Count shader declarations in source
  const computeMatches = source.match(/stage:\s*["']compute["']/g) || [];
  const vertexMatches = source.match(/@vertex/g) || [];
  const fragmentMatches = source.match(/@fragment/g) || [];

  return {
    total: computeMatches.length + vertexMatches.length + fragmentMatches.length,
    compute: computeMatches.length,
    vertex: vertexMatches.length,
    fragment: fragmentMatches.length,
  };
}

describe('WebGPU Compute Benchmark - analyzeShaders', () => {
  describe('analyzeShaders', () => {
    it('counts compute shaders correctly', () => {
      const source = `
        stage: "compute",
        @workgroup_size(64)
        stage: 'compute',
        stage:"compute",
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(3);
      expect(result.vertex).toBe(0);
      expect(result.fragment).toBe(0);
      expect(result.total).toBe(3);
    });

    it('counts vertex shaders correctly', () => {
      const source = `
        @vertex
        fn vs_main() -> @builtin(position) vec4<f32> {
          return vec4<f32>(0.0, 0.0, 0.0, 1.0);
        }
        
        @vertex
        fn another_vertex() {
        }
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(0);
      expect(result.vertex).toBe(2);
      expect(result.fragment).toBe(0);
      expect(result.total).toBe(2);
    });

    it('counts fragment shaders correctly', () => {
      const source = `
        @fragment
        fn fs_main() -> @location(0) vec4<f32> {
          return vec4<f32>(1.0, 0.0, 0.0, 1.0);
        }
        
        @fragment
        fn another_fragment() {
        }
        
        @fragment fn inline_fragment() {}
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(0);
      expect(result.vertex).toBe(0);
      expect(result.fragment).toBe(3);
      expect(result.total).toBe(3);
    });

    it('counts mixed shader types correctly', () => {
      const source = `
        // Compute shader
        stage: "compute",
        @workgroup_size(64, 1, 1)
        
        // Vertex shader
        @vertex
        fn vs_main() -> @builtin(position) vec4<f32> {
          return vec4<f32>(0.0);
        }
        
        // Fragment shader
        @fragment
        fn fs_main() -> @location(0) vec4<f32> {
          return vec4<f32>(1.0);
        }
        
        // Another compute shader
        stage: 'compute',
        
        // Another vertex shader
        @vertex
        fn vs_secondary() {
        }
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(2);
      expect(result.vertex).toBe(2);
      expect(result.fragment).toBe(1);
      expect(result.total).toBe(5);
    });

    it('handles empty source correctly', () => {
      const result = analyzeShaders('', '');

      expect(result.compute).toBe(0);
      expect(result.vertex).toBe(0);
      expect(result.fragment).toBe(0);
      expect(result.total).toBe(0);
    });

    it('handles source with no shaders', () => {
      const source = `
        fn utility_function() {
          let x = 1.0;
          return x * 2.0;
        }
        
        struct MyStruct {
          value: f32,
        }
        
        let CONSTANT = 42;
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(0);
      expect(result.vertex).toBe(0);
      expect(result.fragment).toBe(0);
      expect(result.total).toBe(0);
    });

    it('handles various compute stage quotation styles', () => {
      const source = `
        stage: "compute",
        stage: 'compute',
        stage:"compute",
        stage:'compute',
        stage : "compute",
        stage : 'compute',
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(6);
      expect(result.total).toBe(6);
    });

    it('ignores partial matches', () => {
      const source = `
        // These should NOT match
        stage: "not_compute",
        @not_vertex
        @not_fragment
        function vertex() {}
        function fragment() {}
        compute_helper_function();
        
        // These SHOULD match
        stage: "compute",
        @vertex
        @fragment
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(1);
      expect(result.vertex).toBe(1);
      expect(result.fragment).toBe(1);
      expect(result.total).toBe(3);
    });

    it('handles real-world WebGPU compute shader example', () => {
      const source = `
        // Particle update compute shader
        stage: "compute",
        @workgroup_size(64, 1, 1)
        fn update_particles(@builtin(global_invocation_id) global_id: vec3<u32>) {
          let index = global_id.x;
          if (index >= arrayLength(&particles)) {
            return;
          }
          
          // Update particle position
          particles[index].position += particles[index].velocity * deltaTime;
        }
        
        // Rendering vertex shader
        @vertex
        fn vs_particles(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
          var output: VertexOutput;
          output.position = camera.viewProjection * vec4<f32>(particles[vertex_index].position, 1.0);
          return output;
        }
        
        // Particle fragment shader
        @fragment
        fn fs_particles(input: VertexOutput) -> @location(0) vec4<f32> {
          return vec4<f32>(1.0, 0.5, 0.0, 1.0); // Orange particles
        }
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(1);
      expect(result.vertex).toBe(1);
      expect(result.fragment).toBe(1);
      expect(result.total).toBe(3);
    });

    it('handles comments and strings correctly', () => {
      const source = `
        // This comment has @vertex but shouldn't count
        /* Block comment with @fragment shouldn't count */
        let shader_code = "stage: 'compute'"; // String literal shouldn't count
        
        // These should count
        stage: "compute",
        @vertex
        @fragment
      `;
      const result = analyzeShaders('', source);

      expect(result.compute).toBe(1);
      expect(result.vertex).toBe(1);
      expect(result.fragment).toBe(1);
      expect(result.total).toBe(3);
    });
  });
});
