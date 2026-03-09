# Media Traits

> Part of the HoloScript Traits reference. Browse: [Audio](/traits/audio) · [Visual](/traits/visual) · [All Traits](/traits/)

## Media Traits

### @gaussian_splat

Gaussian splatting for photorealistic 3D capture.

```hsplus
object ScannedRoom @gaussian_splat {
  source: 'room.ply'
  quality: 'high'
}
```

| Config       | Type   | Default    | Description             |
| ------------ | ------ | ---------- | ----------------------- |
| `source`     | string | ''         | PLY file path           |
| `quality`    | string | 'medium'   | 'low', 'medium', 'high' |
| `sort_mode`  | string | 'distance' | Render sort mode        |
| `max_splats` | number | 1000000    | Max splat count         |

**Events:**

- `splat_loaded` - Data loaded
- `splat_render_start` - Rendering started
- `splat_render_complete` - Frame complete
- `splat_error` - Load/render error

---

### @nerf

Neural Radiance Field rendering.

```hsplus
object CapturedScene @nerf {
  model_path: 'scene.nerf'
  resolution: 512
}
```

| Config       | Type   | Default | Description       |
| ------------ | ------ | ------- | ----------------- |
| `model_path` | string | ''      | NeRF model path   |
| `resolution` | number | 256     | Render resolution |
| `near_plane` | number | 0.1     | Near clipping     |
| `far_plane`  | number | 100     | Far clipping      |

---

### @volumetric_video

Volumetric video playback (8i, HoloStream).

```hsplus
object Performer @volumetric_video {
  source: 'performance.hvd'
  format: '8i'
}
```

| Config        | Type    | Default | Description       |
| ------------- | ------- | ------- | ----------------- |
| `source`      | string  | ''      | Video source path |
| `format`      | string  | 'hvd'   | Format type       |
| `loop`        | boolean | false   | Loop playback     |
| `autoplay`    | boolean | false   | Auto-start        |
| `buffer_size` | number  | 30      | Buffer frames     |

**State:**

- `playbackState` - 'idle', 'loading', 'playing', 'paused', 'error'
- `currentTime` - Current position
- `duration` - Total duration
- `bufferedPercent` - Buffer progress

**Events:**

- `volume_loaded` - Video loaded
- `volume_play` - Playback started
- `volume_pause` - Playback paused
- `volume_ended` - Playback ended
- `on_volume_playbackState_change` - State changed

---

### @photogrammetry

Photogrammetry asset with LOD.

```hsplus
object Statue @photogrammetry {
  base_path: 'statue/'
  lod_levels: 4
}
```

| Config               | Type   | Default | Description    |
| -------------------- | ------ | ------- | -------------- |
| `base_path`          | string | ''      | Asset path     |
| `lod_levels`         | number | 3       | Number of LODs |
| `texture_resolution` | number | 2048    | Texture size   |

---

### @point_cloud

Point cloud visualization.

```hsplus
object LidarScan @point_cloud {
  source: 'scan.las'
  point_size: 2
}
```

| Config       | Type   | Default  | Description                  |
| ------------ | ------ | -------- | ---------------------------- |
| `source`     | string | ''       | Point cloud file             |
| `point_size` | number | 1        | Point render size            |
| `max_points` | number | 10000000 | Max points to render         |
| `color_mode` | string | 'rgb'    | 'rgb', 'intensity', 'height' |

---

## See Also

- [Audio Traits](/traits/audio)
- [Visual Traits](/traits/visual)
- [API Reference](/api/)
