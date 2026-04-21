export const maxDuration = 300;

/**
 * GET /api/shader-presets — GLSL shader snippet catalog.
 * Each preset contains vertex and/or fragment GLSL that can be embedded in @material.
 */

export interface ShaderPreset {
  id: string;
  name: string;
  category: 'distortion' | 'color' | 'procedural' | 'post';
  description: string;
  emoji: string;
  vertexGLSL?: string;
  fragmentGLSL?: string;
  uniforms: Record<string, { type: 'float' | 'vec3' | 'vec4'; default: number | number[] }>;
  traitSnippet: string;
}

const PRESETS: ShaderPreset[] = [
  {
    id: 'wave-displace',
    name: 'Wave Displacement',
    category: 'distortion',
    emoji: '🌊',
    description: 'Sinusoidal vertex displacement on Y axis — ripple effect for water/cloth',
    vertexGLSL: `float wave = sin(position.x * uFrequency + uTime * uSpeed) * uAmplitude;
position.y += wave;`,
    uniforms: {
      uTime: { type: 'float', default: 0 },
      uFrequency: { type: 'float', default: 2.0 },
      uSpeed: { type: 'float', default: 1.5 },
      uAmplitude: { type: 'float', default: 0.15 },
    },
    traitSnippet: `  @material {
    vertexShader: "sin(position.x * 2.0 + uTime * 1.5) * 0.15"
    uFrequency: 2.0
    uSpeed: 1.5
    uAmplitude: 0.15
  }`,
  },
  {
    id: 'hologram',
    name: 'Hologram Glitch',
    category: 'color',
    emoji: '👾',
    description: 'Scanline + RGB shift glitch effect for sci-fi objects',
    fragmentGLSL: `float scanline = mod(vUv.y * 100.0 + uTime * 10.0, 1.0);
vec3 glitch = vec3(scanline > 0.95 ? 0.0 : 1.0);
gl_FragColor = vec4(uColor * glitch, 0.8 + sin(uTime) * 0.2);`,
    uniforms: {
      uTime: { type: 'float', default: 0 },
      uColor: { type: 'vec3', default: [0.0, 1.0, 0.8] },
    },
    traitSnippet: `  @material {
    fragmentShader: "hologram"
    emissive: "#00ffcc"
    emissiveIntensity: 2.0
    opacity: 0.8
    wireframe: false
  }`,
  },
  {
    id: 'plasma',
    name: 'Plasma Wave',
    category: 'procedural',
    emoji: '🔮',
    description: 'Multi-frequency sine plasma for mystical/energy objects',
    fragmentGLSL: `float plasma = sin(vUv.x * 10.0 + uTime) + sin(vUv.y * 10.0 + uTime * 1.3);
plasma += sin((vUv.x + vUv.y) * 7.0 + uTime * 0.7);
vec3 col = 0.5 + 0.5 * cos(uTime + vec3(plasma, plasma + 2.1, plasma + 4.2));
gl_FragColor = vec4(col, 1.0);`,
    uniforms: { uTime: { type: 'float', default: 0 } },
    traitSnippet: `  @material {
    fragmentShader: "plasma"
    roughness: 0.0
    metallic: 0.5
  }`,
  },
  {
    id: 'fresnel',
    name: 'Fresnel Rim',
    category: 'color',
    emoji: '💫',
    description: 'View-angle dependent rim glow — perfect for force fields and shields',
    fragmentGLSL: `float fresnel = pow(1.0 - dot(vNormal, vViewDir), uPower);
gl_FragColor = mix(uBaseColor, uRimColor, fresnel);`,
    uniforms: {
      uPower: { type: 'float', default: 3.0 },
      uBaseColor: { type: 'vec3', default: [0.05, 0.05, 0.1] },
      uRimColor: { type: 'vec3', default: [0.0, 0.8, 1.0] },
    },
    traitSnippet: `  @material {
    fragmentShader: "fresnel"
    uPower: 3.0
    rimColor: "#00ccff"
    opacity: 0.7
  }`,
  },
  {
    id: 'dissolve',
    name: 'Noise Dissolve',
    category: 'distortion',
    emoji: '💨',
    description: 'Threshold-based noise dissolve — objects appearing or disappearing',
    fragmentGLSL: `float noise = fract(sin(dot(vUv, vec2(127.1, 311.7))) * 43758.5);
if (noise < uThreshold) discard;
gl_FragColor = vec4(uColor, 1.0);`,
    uniforms: {
      uThreshold: { type: 'float', default: 0.5 },
      uColor: { type: 'vec3', default: [0.4, 0.8, 1.0] },
    },
    traitSnippet: `  @material {
    fragmentShader: "dissolve"
    uThreshold: 0.5
    albedo: "#66ccff"
  }`,
  },
  {
    id: 'cel-shade',
    name: 'Cel Shading',
    category: 'color',
    emoji: '🎨',
    description: 'Quantized flat-shaded toon look with hard shadow steps',
    fragmentGLSL: `float diffuse = max(dot(vNormal, uLightDir), 0.0);
float cel = floor(diffuse * uSteps) / uSteps;
gl_FragColor = vec4(uColor * (0.2 + 0.8 * cel), 1.0);`,
    uniforms: {
      uSteps: { type: 'float', default: 4.0 },
      uLightDir: { type: 'vec3', default: [0.5, 1.0, 0.5] },
      uColor: { type: 'vec3', default: [0.9, 0.4, 0.2] },
    },
    traitSnippet: `  @material {
    fragmentShader: "cel"
    uSteps: 4.0
    albedo: "#e06633"
  }`,
  },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.toLowerCase() ?? '';
  const category = url.searchParams.get('category') ?? '';
  let results: ShaderPreset[] = PRESETS;
  if (category) results = results.filter((p) => p.category === category);
  if (q)
    results = results.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  const categories = [...new Set(PRESETS.map((p) => p.category))];
  return Response.json({ presets: results, total: results.length, categories });
}


// PUBLIC-CORS: documented-public endpoint, intentional wildcard (SEC-T11)
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
