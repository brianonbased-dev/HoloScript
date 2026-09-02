/**
 * renderer.ts — Bravura's minimal sovereign WebGL renderer.
 *
 * Named decision (GATES.md gate 3): the engine's XR render path is
 * WebGPU-binding-gated and its own header expects WebGL fallback on today's
 * headsets, and that fallback is the legacy three.js surface the ecosystem
 * is retiring. So the room carries a ~300-line purpose-built forward
 * renderer: one lit program (hemisphere ambient + spotlight + Blinn-Phong +
 * metal-tinted fresnel + fog-to-black) and one unlit textured program for
 * the HUD. Stereo comes straight from XR view/projection matrices — no
 * hand-rolled camera math in VR.
 */

import { MeshData } from './meshes';
import { Mat4 } from './math3';

export interface Material {
  color: [number, number, number];
  metal: number; // 0 dielectric .. 1 metal (tints specular with albedo)
  shiny: number; // Blinn-Phong exponent
  emissive: number; // 0..1 self-glow of albedo
}

export interface Mesh {
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  count: number;
}

const LIT_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uProj, uView, uModel;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * uView * w;
}
`;

const LIT_FS = `
precision mediump float;
varying vec3 vWorld;
varying vec3 vNormal;
uniform vec3 uColor;
uniform float uMetal, uShiny, uEmissive;
uniform vec3 uCamPos;
uniform vec3 uSpotPos, uSpotDir, uSpotColor;
uniform float uSpotCosInner, uSpotCosOuter;
uniform vec3 uAmbUp, uAmbDown;
uniform float uFog;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);

  // Hemisphere ambient
  float hemi = N.y * 0.5 + 0.5;
  vec3 amb = mix(uAmbDown, uAmbUp, hemi);

  // Spotlight
  vec3 Ldir = uSpotPos - vWorld;
  float dist = length(Ldir);
  vec3 L = Ldir / max(dist, 1e-4);
  float cone = smoothstep(uSpotCosOuter, uSpotCosInner, dot(-L, normalize(uSpotDir)));
  float atten = cone / (1.0 + 0.10 * dist * dist);
  float ndl = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), uShiny) * atten;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);

  // Soft front fill (directional, no falloff): lifts the copper curve out of
  // the dark without flattening the single-spot stage look.
  vec3 F = normalize(vec3(-0.45, 0.35, 0.82));
  float fill = max(dot(N, F), 0.0) * (0.20 + 0.22 * uMetal);
  vec3 Hf = normalize(F + V);
  float fillSpec = pow(max(dot(N, Hf), 0.0), uShiny) * 0.22;

  vec3 specTint = mix(vec3(1.0), uColor, uMetal);
  vec3 fillCol = vec3(0.62, 0.56, 0.48);
  vec3 lit = uColor * (amb + uSpotColor * ndl * atten + fillCol * fill)
           + specTint * (uSpotColor * spec + fillCol * fillSpec) * (0.35 + 0.65 * uMetal)
           + specTint * fres * (0.10 + 0.60 * uMetal) * (amb + uSpotColor * atten * 0.5 + fillCol * 0.35)
           + uColor * uEmissive;

  float fog = exp(-uFog * dot(vWorld - uCamPos, vWorld - uCamPos));
  gl_FragColor = vec4(lit * fog, 1.0);
}
`;

const HUD_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uProj, uView, uModel;
varying vec2 vUV;
void main() {
  vUV = aPos.xy + 0.5;
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}
`;

const HUD_FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
void main() {
  vec4 c = texture2D(uTex, vec2(vUV.x, 1.0 - vUV.y));
  if (c.a < 0.02) discard;
  gl_FragColor = c;
}
`;

function compile(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const mk = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`shader: ${gl.getShaderInfoLog(sh) ?? 'unknown'}`);
    }
    return sh;
  };
  const prog = gl.createProgram();
  if (!prog) throw new Error('createProgram failed');
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(prog) ?? 'unknown'}`);
  }
  return prog;
}

export class Renderer {
  readonly gl: WebGLRenderingContext;
  private lit: WebGLProgram;
  private hud: WebGLProgram;
  private uLit: Record<string, WebGLUniformLocation | null> = {};
  private uHud: Record<string, WebGLUniformLocation | null> = {};
  private proj: Mat4 | null = null;
  private view: Mat4 | null = null;
  private camPos: [number, number, number] = [0, 0, 0];

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.lit = compile(gl, LIT_VS, LIT_FS);
    this.hud = compile(gl, HUD_VS, HUD_FS);
    for (const n of [
      'uProj', 'uView', 'uModel', 'uColor', 'uMetal', 'uShiny', 'uEmissive', 'uCamPos',
      'uSpotPos', 'uSpotDir', 'uSpotColor', 'uSpotCosInner', 'uSpotCosOuter',
      'uAmbUp', 'uAmbDown', 'uFog',
    ]) {
      this.uLit[n] = gl.getUniformLocation(this.lit, n);
    }
    for (const n of ['uProj', 'uView', 'uModel', 'uTex']) {
      this.uHud[n] = gl.getUniformLocation(this.hud, n);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  createMesh(data: MeshData): Mesh {
    const gl = this.gl;
    const inter = new Float32Array((data.positions.length / 3) * 6);
    for (let i = 0; i < data.positions.length / 3; i++) {
      inter[i * 6 + 0] = data.positions[i * 3 + 0];
      inter[i * 6 + 1] = data.positions[i * 3 + 1];
      inter[i * 6 + 2] = data.positions[i * 3 + 2];
      inter[i * 6 + 3] = data.normals[i * 3 + 0];
      inter[i * 6 + 4] = data.normals[i * 3 + 1];
      inter[i * 6 + 5] = data.normals[i * 3 + 2];
    }
    const vbo = gl.createBuffer();
    if (!vbo) throw new Error('createBuffer failed');
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    if (!ibo) throw new Error('createBuffer failed');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
    return { vbo, ibo, count: data.indices.length };
  }

  createHudTexture(canvas: HTMLCanvasElement): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  updateHudTexture(tex: WebGLTexture, canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  beginView(
    viewport: { x: number; y: number; width: number; height: number },
    proj: Mat4,
    view: Mat4,
    camPos: [number, number, number]
  ): void {
    const gl = this.gl;
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    this.proj = proj;
    this.view = view;
    this.camPos = camPos;
    gl.useProgram(this.lit);
    gl.uniformMatrix4fv(this.uLit.uProj, false, proj);
    gl.uniformMatrix4fv(this.uLit.uView, false, view);
    gl.uniform3fv(this.uLit.uCamPos, camPos);
    // The room: one warm spotlight high above the instrument, near-black
    // hemisphere, fog eating the distance.
    gl.uniform3f(this.uLit.uSpotPos, 0.3, 3.4, -1.1);
    gl.uniform3f(this.uLit.uSpotDir, -0.08, -1.0, -0.08);
    gl.uniform3f(this.uLit.uSpotColor, 1.55, 1.42, 1.18);
    gl.uniform1f(this.uLit.uSpotCosInner, Math.cos(0.42));
    gl.uniform1f(this.uLit.uSpotCosOuter, Math.cos(0.62));
    gl.uniform3f(this.uLit.uAmbUp, 0.045, 0.05, 0.06);
    gl.uniform3f(this.uLit.uAmbDown, 0.012, 0.012, 0.016);
    gl.uniform1f(this.uLit.uFog, 0.012);
  }

  draw(mesh: Mesh, model: Mat4, mat: Material): void {
    const gl = this.gl;
    gl.useProgram(this.lit);
    gl.uniformMatrix4fv(this.uLit.uModel, false, model);
    gl.uniform3fv(this.uLit.uColor, mat.color);
    gl.uniform1f(this.uLit.uMetal, mat.metal);
    gl.uniform1f(this.uLit.uShiny, mat.shiny);
    gl.uniform1f(this.uLit.uEmissive, mat.emissive);
    this.bindAndDraw(mesh, this.lit);
  }

  drawHud(mesh: Mesh, model: Mat4, tex: WebGLTexture): void {
    const gl = this.gl;
    gl.useProgram(this.hud);
    gl.uniformMatrix4fv(this.uHud.uProj, false, this.proj as Mat4);
    gl.uniformMatrix4fv(this.uHud.uView, false, this.view as Mat4);
    gl.uniformMatrix4fv(this.uHud.uModel, false, model);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uHud.uTex, 0);
    gl.disable(gl.CULL_FACE);
    this.bindAndDraw(mesh, this.hud);
    gl.enable(gl.CULL_FACE);
  }

  private bindAndDraw(mesh: Mesh, prog: WebGLProgram): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aNormal = gl.getAttribLocation(prog, 'aNormal');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    if (aNormal >= 0) {
      gl.enableVertexAttribArray(aNormal);
      gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
}
