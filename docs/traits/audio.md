# Audio Traits

> Part of the HoloScript Traits reference. Browse: [Interaction](/traits/interaction) · [Spatial](/traits/spatial) · [All Traits](/traits/)

## Audio Traits

### @spatial_audio

**Category:** Audio
**Tags:** 3d, sound, spatial, hrtf, immersion

3D spatial audio with HRTF.

```hsplus
object Radio @spatial_audio {
  audio_src: 'music.mp3'
  rolloff: 'logarithmic'
}
```

| Config         | Type   | Default  | Description                       |
| -------------- | ------ | -------- | --------------------------------- |
| `rolloff`      | string | 'linear' | 'linear', 'logarithmic', 'custom' |
| `min_distance` | number | 1.0      | Full volume distance              |
| `max_distance` | number | 100      | Zero volume distance              |
| `cone_inner`   | number | 360      | Inner cone (degrees)              |
| `cone_outer`   | number | 360      | Outer cone (degrees)              |

---

### @reverb_zone

Environmental reverb areas.

```hsplus
object CaveArea @reverb_zone(preset: 'cave', mix: 0.7) {
  geometry: 'cube'
  scale: [20, 10, 20]
}
```

| Config       | Type   | Default | Description                       |
| ------------ | ------ | ------- | --------------------------------- |
| `preset`     | string | 'room'  | 'room', 'hall', 'cave', 'outdoor' |
| `mix`        | number | 0.5     | Wet/dry mix (0-1)                 |
| `decay_time` | number | 1.5     | Reverb decay (seconds)            |

---

### @ambisonics

First-order ambisonic audio.

```hsplus
object Environment @ambisonics {
  source: 'forest_ambience.amb'
  format: 'FuMa'
}
```

| Config   | Type   | Default    | Description           |
| -------- | ------ | ---------- | --------------------- |
| `format` | string | 'ACN_SN3D' | 'FuMa', 'ACN_SN3D'    |
| `order`  | number | 1          | Ambisonic order (1-3) |

---

### @voice_proximity

Proximity-based voice chat.

```hsplus
zone VoiceArea @voice_proximity(falloff_start: 1, falloff_end: 10) {
  geometry: 'sphere'
  radius: 10
}
```

| Config          | Type    | Default | Description          |
| --------------- | ------- | ------- | -------------------- |
| `falloff_start` | number  | 1       | Full volume distance |
| `falloff_end`   | number  | 10      | Zero volume distance |
| `directional`   | boolean | false   | Face-to-face boost   |

---


## See Also
- [Spatial Traits](/traits/spatial)
- [API Reference](/api/)
