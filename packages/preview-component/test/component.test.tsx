/**
 * Tests for the HoloScriptPreview React component.
 *
 * Uses jsdom environment. Three.js rendering is mocked since
 * WebGL is not available in jsdom.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { HoloScriptPreview } from '../src/components/HoloScriptPreview';

// Mock Three.js -- jsdom does not support WebGL
vi.mock('three', () => {
  const Color = vi.fn().mockImplementation(function (this: any, _c?: number) {
    this.r = 0; this.g = 0; this.b = 0;
  });
  const Vec3 = vi.fn().mockImplementation(function (this: any) {
    this.x = 0; this.y = 0; this.z = 0;
    this.set = vi.fn().mockReturnThis();
  });
  const GeometryMock = vi.fn().mockImplementation(function (this: any) {
    this.dispose = vi.fn();
    this.scale = vi.fn().mockReturnThis();
    this.center = vi.fn().mockReturnThis();
    this.rotateX = vi.fn().mockReturnThis();
    this.setAttribute = vi.fn();
    this.getAttribute = vi.fn();
    this.attributes = { position: { array: new Float32Array(0), needsUpdate: false } };
  });
  const MaterialMock = vi.fn().mockImplementation(function (this: any) {
    this.dispose = vi.fn();
    this.wireframe = false;
    this.needsUpdate = false;
    this.color = { setHSL: vi.fn() };
    this.emissiveIntensity = 0;
  });
  const MeshMock = vi.fn().mockImplementation(function (this: any) {
    this.position = { set: vi.fn(), x: 0, y: 0, z: 0 };
    this.rotation = { set: vi.fn(), x: 0, y: 0, z: 0 };
    this.scale = { set: vi.fn(), x: 1, y: 1, z: 1 };
    this.castShadow = false;
    this.receiveShadow = false;
    this.name = '';
    this.material = { dispose: vi.fn(), wireframe: false };
    this.geometry = { dispose: vi.fn() };
  });
  const ShapeMock = vi.fn().mockImplementation(function (this: any) {
    this.moveTo = vi.fn();
    this.bezierCurveTo = vi.fn();
  });
  const ClockMock = vi.fn().mockImplementation(function (this: any) {
    this.getDelta = vi.fn(() => 0.016);
    this.getElapsedTime = vi.fn(() => 0);
  });
  const RendererMock = vi.fn().mockImplementation(function (this: any) {
    this.setSize = vi.fn();
    this.setPixelRatio = vi.fn();
    this.render = vi.fn();
    this.dispose = vi.fn();
    this.domElement = document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
  });
  const CameraMock = vi.fn().mockImplementation(function (this: any) {
    this.position = { set: vi.fn(), x: 0, y: 0, z: 0 };
    this.aspect = 1;
    this.updateProjectionMatrix = vi.fn();
  });
  const SceneMock = vi.fn().mockImplementation(function (this: any) {
    this.background = null;
    this.fog = null;
    this.add = vi.fn();
    this.remove = vi.fn();
  });
  const TextureLoaderMock = vi.fn().mockImplementation(function (this: any) {
    this.setCrossOrigin = vi.fn();
    this.load = vi.fn();
  });

  return {
    Color,
    Vector3: Vec3,
    Scene: SceneMock,
    PerspectiveCamera: CameraMock,
    WebGLRenderer: RendererMock,
    Clock: ClockMock,
    Mesh: MeshMock,
    Shape: ShapeMock,
    BoxGeometry: GeometryMock,
    SphereGeometry: GeometryMock,
    CylinderGeometry: GeometryMock,
    ConeGeometry: GeometryMock,
    TorusGeometry: GeometryMock,
    PlaneGeometry: GeometryMock,
    TorusKnotGeometry: GeometryMock,
    DodecahedronGeometry: GeometryMock,
    IcosahedronGeometry: GeometryMock,
    OctahedronGeometry: GeometryMock,
    TetrahedronGeometry: GeometryMock,
    CapsuleGeometry: GeometryMock,
    ExtrudeGeometry: GeometryMock,
    GridHelper: vi.fn().mockImplementation(function (this: any) {
      this.visible = true;
      this.material = { opacity: 1, transparent: false };
    }),
    AxesHelper: vi.fn().mockImplementation(function (this: any) {
      this.visible = true;
    }),
    HemisphereLight: vi.fn().mockImplementation(function (this: any) {
      this.position = { set: vi.fn() };
    }),
    DirectionalLight: vi.fn().mockImplementation(function (this: any) {
      this.position = { set: vi.fn() };
      this.castShadow = false;
      this.shadow = { mapSize: { width: 0, height: 0 } };
    }),
    Fog: vi.fn().mockImplementation(function (this: any) {
      this.color = 0;
      this.near = 0;
      this.far = 0;
    }),
    ShadowMaterial: MaterialMock,
    MeshStandardMaterial: MaterialMock,
    MeshBasicMaterial: MaterialMock,
    MeshLambertMaterial: MaterialMock,
    MeshPhysicalMaterial: MaterialMock,
    CanvasTexture: vi.fn().mockImplementation(function (this: any) {
      this.mapping = 0;
    }),
    TextureLoader: TextureLoaderMock,
    PCFSoftShadowMap: 2,
    ACESFilmicToneMapping: 6,
    EquirectangularReflectionMapping: 303,
    RepeatWrapping: 1000,
  };
});

// Mock OrbitControls
const MockOrbitControls = vi.fn().mockImplementation(function (this: any) {
  this.enableDamping = false;
  this.dampingFactor = 0;
  this.update = vi.fn();
  this.dispose = vi.fn();
  this.reset = vi.fn();
});

describe('HoloScriptPreview', () => {
  const sampleCode = `
    orb mySphere {
      geometry: "sphere"
      color: "cyan"
      position: [0, 1, 0]
    }
  `;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      // Don't actually call the callback to avoid infinite loop
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  it('should render the container with data-testid', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
      />
    );

    const container = screen.getByTestId('holoscript-preview');
    expect(container).toBeTruthy();
  });

  it('should render with custom width and height', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        width={800}
        height={600}
      />
    );

    const container = screen.getByTestId('holoscript-preview');
    expect(container.style.width).toBe('800px');
    expect(container.style.height).toBe('600px');
  });

  it('should show toolbar buttons by default', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
      />
    );

    expect(screen.getByLabelText('Reset camera')).toBeTruthy();
    expect(screen.getByLabelText('Toggle wireframe')).toBeTruthy();
    expect(screen.getByLabelText('Toggle grid')).toBeTruthy();
    expect(screen.getByLabelText('Toggle axes')).toBeTruthy();
  });

  it('should hide toolbar in embed mode', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        embed={true}
      />
    );

    expect(screen.queryByLabelText('Reset camera')).toBeNull();
    expect(screen.queryByLabelText('Toggle wireframe')).toBeNull();
  });

  it('should hide toolbar when showToolbar is false', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        showToolbar={false}
      />
    );

    expect(screen.queryByLabelText('Reset camera')).toBeNull();
  });

  it('should show code toggle button when editable', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        editable={true}
      />
    );

    expect(screen.getByLabelText('Toggle code editor')).toBeTruthy();
  });

  it('should not show code toggle button when not editable', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        editable={false}
      />
    );

    expect(screen.queryByLabelText('Toggle code editor')).toBeNull();
  });

  it('should display file name when provided', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        fileName="demo.hs"
      />
    );

    expect(screen.getByText('demo.hs')).toBeTruthy();
  });

  it('should toggle code panel visibility', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        editable={true}
      />
    );

    // Code panel starts hidden
    expect(screen.queryByLabelText('HoloScript source code')).toBeNull();

    // Click to show
    fireEvent.click(screen.getByLabelText('Toggle code editor'));
    expect(screen.getByLabelText('HoloScript source code')).toBeTruthy();

    // Click to hide
    fireEvent.click(screen.getByLabelText('Toggle code editor'));
    expect(screen.queryByLabelText('HoloScript source code')).toBeNull();
  });

  it('should call onCodeChange when code is edited', async () => {
    const THREE = await import('three');
    const onCodeChange = vi.fn();

    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        editable={true}
        onCodeChange={onCodeChange}
      />
    );

    // Open code panel
    fireEvent.click(screen.getByLabelText('Toggle code editor'));

    // Change code
    const textarea = screen.getByLabelText('HoloScript source code');
    fireEvent.change(textarea, { target: { value: 'new code' } });

    expect(onCodeChange).toHaveBeenCalledWith('new code');
  });

  it('should have proper ARIA attributes', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
      />
    );

    const container = screen.getByTestId('holoscript-preview');
    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('aria-label')).toBe('HoloScript 3D Preview');
  });

  it('should apply custom className', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        className="my-custom-class"
      />
    );

    const container = screen.getByTestId('holoscript-preview');
    expect(container.classList.contains('my-custom-class')).toBe(true);
  });

  it('should accept string dimensions', async () => {
    const THREE = await import('three');
    render(
      <HoloScriptPreview
        code={sampleCode}
        threeModule={THREE}
        orbitControls={MockOrbitControls}
        width="100%"
        height="50vh"
      />
    );

    const container = screen.getByTestId('holoscript-preview');
    expect(container.style.width).toBe('100%');
    expect(container.style.height).toBe('50vh');
  });
});
