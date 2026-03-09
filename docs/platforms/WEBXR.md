# WebXR & Babylon.js Integration Guide

Compile HoloScript to browser-based VR/AR experiences - no installation required.

## Quick Start

### 1. Compile to WebXR

```bash
# Three.js (lighter, faster)
holoscript compile my-experience.holo --target webxr --output ./build/webxr/

# Babylon.js (better graphics)
holoscript compile my-experience.holo --target babylonjs --output ./build/babylon/
```

**Output structure:**

```
build/webxr/
├── index.html
├── scene.js
├── assets/
│   ├── models/
│   └── textures/
└── package.json
```

### 2. Install Dependencies

```bash
cd build/webxr
npm install
```

### 3. Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

**Production build:**

```bash
npm run build
# Deploy dist/ folder to hosting
```

## Platform Support

### Desktop VR

- ✅ Meta Quest Browser (Link/Air Link)
- ✅ SteamVR (Chrome, Firefox)
- ✅ Windows Mixed Reality

### Mobile AR

- ✅ iOS Safari 15+ (WebXR AR)
- ✅ Android Chrome 90+ (AR Module)

### Desktop Fallback

- Mouse + keyboard controls
- No VR headset required
- Full functionality

## Three.js vs. Babylon.js

| Feature              | Three.js               | Babylon.js             |
| -------------------- | ---------------------- | ---------------------- |
| **File Size**        | ~600KB                 | ~2MB                   |
| **Performance**      | Faster (mobile)        | Slower (more features) |
| **Graphics Quality** | Good                   | Excellent              |
| **VR Support**       | WebXR Device API       | Full XR support        |
| **Physics**          | Cannon.js/Ammo.js      | Havok/Cannon.js        |
| **Best For**         | Mobile AR, Quick demos | High-quality VR        |

### When to Use Three.js

- Mobile AR experiences
- Lightweight WebXR demos
- Fast loading required

### When to Use Babylon.js

- Desktop VR with high graphics
- Complex physics simulations
- Advanced lighting/shadows

## Example: WebXR Scene

**HoloScript:**

```holoscript
composition "WebVRDemo" {
  environment {
    skybox: "space"
    ambient_light: { intensity: 0.5 }
  }

  object#cube @interactive {
    type: "cube"
    size: { x: 1, y: 1, z: 1 }
    position: { x: 0, y: 1.5, z: -2 }

    on_interact {
      change_color: #00ff00
    }
  }

  camera#player @vr {
    position: { y: 1.7 }
  }
}
```

**Generated Three.js:**

```javascript
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// Cube
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
const cube = new THREE.Mesh(geometry, material);
cube.position.set(0, 1.5, -2);
scene.add(cube);

// Interaction
cube.userData.onClick = () => {
  cube.material.color.set(0x00ff00);
};

// Render loop
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
```

**Generated Babylon.js:**

```javascript
import * as BABYLON from '@babylonjs/core';

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);
const scene = new BABYLON.Scene(engine);

const camera = new BABYLON.WebXRCamera('camera', scene);
camera.position.set(0, 1.7, 0);

const vrHelper = await scene.createDefaultXRExperienceAsync();

// Cube
const cube = BABYLON.MeshBuilder.CreateBox('cube', { size: 1 }, scene);
cube.position.set(0, 1.5, -2);

const material = new BABYLON.StandardMaterial('cubeMat', scene);
material.diffuseColor = BABYLON.Color3.White();
cube.material = material;

// Interaction
cube.actionManager = new BABYLON.ActionManager(scene);
cube.actionManager.registerAction(
  new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, () => {
    material.diffuseColor = BABYLON.Color3.Green();
  })
);

engine.runRenderLoop(() => {
  scene.render();
});
```

## AR Mode (Mobile)

### iOS Safari AR

```holoscript
ar_session#furniture_ar {
  plane_detection: "horizontal"

  object#chair @ar_placeable {
    model: "chair.glb"

    on_plane_detected {
      spawn_at: detected_plane.center
    }
  }
}
```

**Generated WebXR AR:**

```javascript
const xrSession = await navigator.xr.requestSession('immersive-ar', {
  requiredFeatures: ['hit-test'],
});

const hitTestSource = await xrSession.requestHitTestSource({
  space: viewerSpace,
});

// Place object on tap
canvas.addEventListener('click', (event) => {
  const hitResults = frame.getHitTestResults(hitTestSource);
  if (hitResults.length > 0) {
    const pose = hitResults[0].getPose(referenceSpace);
    chair.position.copy(pose.transform.position);
  }
});
```

## Deployment

### Static Hosting

**Vercel:**

```bash
npm install -g vercel
vercel deploy
```

**Netlify:**

```bash
npm install -g netlify-cli
netlify deploy --prod
```

**GitHub Pages:**

```bash
npm run build
git add dist/
git commit -m "Deploy"
git subtree push --prefix dist origin gh-pages
```

### HTTPS Required

WebXR requires HTTPS (except localhost):

- Use free SSL from Let's Encrypt
- Or hosting with built-in SSL (Vercel, Netlify)

## Performance Optimization

### Target Frame Rates

- **Desktop VR**: 60-90 FPS
- **Mobile AR**: 30-60 FPS
- **Desktop Fallback**: 60 FPS

### Optimization Checklist

- [ ] Compress textures (Basis Universal)
- [ ] Use GLTF/GLB models (not OBJ/FBX)
- [ ] Limit polygons to <10k per object
- [ ] Enable frustum culling
- [ ] Use instancing for repeated objects
- [ ] Lazy-load assets
- [ ] Compress JavaScript with Vite/Webpack

### Asset Loading

```javascript
// Lazy load models
const loader = new THREE.GLTFLoader();
loader.load('model.glb', (gltf) => {
  scene.add(gltf.scene);
});

// Show loading screen
const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (url, loaded, total) => {
  console.log(`Loading: ${(loaded / total) * 100}%`);
};
```

## Troubleshooting

### "WebXR not supported"

- Use HTTPS (not HTTP)
- Update browser to latest version
- Check device compatibility

### VR button not appearing

```javascript
// Check WebXR support
if ('xr' in navigator) {
  console.log('WebXR supported');
} else {
  console.error('WebXR not supported');
}
```

### AR not working on iOS

- iOS 15+ required
- Use Safari (not Chrome)
- Enable "Motion & Orientation Access"

### Poor mobile performance

- Reduce texture sizes to 512x512 or 1024x1024
- Limit active lights to 2-3
- Disable shadows on mobile
- Use lower polygon models

## Advanced Features

### Hand Tracking

```javascript
const xrSession = await navigator.xr.requestSession('immersive-vr', {
  requiredFeatures: ['hand-tracking'],
});

xrSession.addEventListener('inputsourceschange', (event) => {
  for (const source of event.added) {
    if (source.hand) {
      // Hand tracking available
    }
  }
});
```

### Controllers

```javascript
// Three.js
const controller = renderer.xr.getController(0);
controller.addEventListener('selectstart', onSelectStart);

// Babylon.js
const leftController = vrHelper.input.controllers[0];
leftController.onTriggerStateChangedObservable.add((trigger) => {
  if (trigger.pressed) {
    // Trigger pressed
  }
});
```

### Spatial Audio

```javascript
const listener = new THREE.AudioListener();
camera.add(listener);

const sound = new THREE.PositionalAudio(listener);
sound.setRefDistance(1);
sound.setMaxDistance(20);
sound.setRolloffFactor(1);

cube.add(sound);
```

## Browser Compatibility

| Browser       | Desktop VR | Mobile AR    | Controllers | Hand Tracking |
| ------------- | ---------- | ------------ | ----------- | ------------- |
| Chrome        | ✅         | ✅ (Android) | ✅          | ✅            |
| Firefox       | ✅         | ❌           | ✅          | ❌            |
| Safari        | ❌         | ✅ (iOS 15+) | ❌          | ❌            |
| Edge          | ✅         | ❌           | ✅          | ✅            |
| Quest Browser | ✅         | ✅           | ✅          | ✅            |

## Resources

- [WebXR Specification](https://www.w3.org/TR/webxr/)
- [Three.js Documentation](https://threejs.org/docs/)
- [Babylon.js Documentation](https://doc.babylonjs.com/)
- [WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)

---

**Ready to go web-native?** Compile your HoloScript and deploy anywhere with WebXR!
