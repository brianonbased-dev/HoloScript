# Browser Render Templates

Pre-built HTML templates for rendering HoloScript scenes in browsers. Perfect for embedding in X posts or sharing as standalone experiences.

## Templates

| Template       | Description                  | Use Case          |
| -------------- | ---------------------------- | ----------------- |
| `minimal.html` | Simplest possible setup      | Quick previews    |
| `scene.html`   | Full scene with controls     | Interactive demos |
| `vr.html`      | WebXR-enabled with fallbacks | VR/AR experiences |
| `embed.html`   | X-optimized with OG tags     | Social sharing    |

## Quick Start

### Using from CDN

```html
<!-- Include in your HTML -->
<script type="module">
  import { renderHoloScript } from 'https://unpkg.com/@holoscript/browser-adapter';

  renderHoloScript(document.getElementById('container'), {
    code: `
      composition "Demo" {
        object "Crystal" @glowing {
          geometry: "sphere"
          color: "#00ffff"
        }
      }
    `,
  });
</script>
```

### Using Templates

1. Copy the template to your project
2. Replace `HOLOSCRIPT_CODE` placeholder with your code
3. Deploy or share the HTML file

## Template Features

### minimal.html

- Three.js scene setup
- Basic lighting
- Mouse orbit controls
- ~50 lines

### scene.html

- Full scene parsing
- Animation support
- Object interaction
- Debug panel
- ~150 lines

### vr.html

- WebXR initialization
- VR/AR mode switching
- Controller input
- Haptic feedback
- ~250 lines

### embed.html

- Twitter Card meta tags
- Open Graph tags
- QR code for mobile XR
- Loading animation
- ~200 lines

## Customization

### Camera Position

```javascript
camera.position.set(x, y, z);
camera.lookAt(targetX, targetY, targetZ);
```

### Background

```javascript
scene.background = new THREE.Color(0x1a1a2e);
// or
scene.background = new THREE.CubeTextureLoader().load([
  'px.jpg',
  'nx.jpg',
  'py.jpg',
  'ny.jpg',
  'pz.jpg',
  'nz.jpg',
]);
```

### Lighting

```javascript
// Ambient
const ambient = new THREE.AmbientLight(0xffffff, 0.5);

// Directional (sun)
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(5, 10, 5);
sun.castShadow = true;

// Point (lamp)
const lamp = new THREE.PointLight(0xffaa00, 1, 10);
```

## Integration with Grok

These templates are designed to be generated and shared by AI agents:

```python
from holoscript import HoloScript

hs = HoloScript()
scene = hs.generate("a glowing crystal cave")

# Get embeddable HTML
embed_html = hs.render(scene.code, template="embed")

# Share on X
share = hs.share(scene.code, platform="x")
print(share.tweet_text)
```

## WebXR Support

For VR/AR rendering:

```html
<script type="module">
  import { VRButton } from 'three/addons/webxr/VRButton.js';

  // Enable WebXR
  renderer.xr.enabled = true;
  document.body.appendChild(VRButton.createButton(renderer));
</script>
```

Supported devices:

- Meta Quest 2/3/Pro
- Apple Vision Pro
- HTC Vive
- Valve Index
- Pico 4
- Magic Leap 2
- Mobile AR (WebXR Viewer)
