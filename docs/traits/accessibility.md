# Accessibility Traits

> Part of the HoloScript Traits reference. Browse: [Interaction](/traits/interaction) · [All Traits](/traits/)

## Accessibility Traits

### @alt_text

**Category:** Accessibility
**Tags:** screen-reader, vision-impairment, description, text

Alternative text for screen readers.

```hsplus
object Logo @alt_text("Company logo - blue square with letter H") {
  geometry: 'plane'
  texture: 'logo.png'
}
```

| Config     | Type   | Default  | Description           |
| ---------- | ------ | -------- | --------------------- |
| `text`     | string | ''       | Description text      |
| `priority` | string | 'polite' | 'polite', 'assertive' |

---

### @screen_reader

Screen reader focus and navigation.

```hsplus
object Menu @screen_reader(role: 'menu', label: 'Main navigation') {
  children: [...]
}
```

| Config        | Type    | Default   | Description      |
| ------------- | ------- | --------- | ---------------- |
| `role`        | string  | 'generic' | ARIA-like role   |
| `label`       | string  | ''        | Accessible name  |
| `live_region` | boolean | false     | Announce changes |

---

### @high_contrast

High contrast mode support.

```hsplus
object Button @high_contrast {
  normal_color: '#333'
  high_contrast_color: '#FFF'
}
```

| Config         | Type    | Default | Description       |
| -------------- | ------- | ------- | ----------------- |
| `border_width` | number  | 2       | Border in HC mode |
| `invert`       | boolean | false   | Invert colors     |

---

### @motion_reduced

Reduced motion accessibility.

```hsplus
object Spinner @motion_reduced {
  animation: 'spin'  // Disabled when preference set
}
```

| Config               | Type    | Default | Description             |
| -------------------- | ------- | ------- | ----------------------- |
| `fallback_animation` | string  | 'none'  | Alternative animation   |
| `reduce_parallax`    | boolean | true    | Reduce parallax effects |

---

### @subtitle

Subtitle/caption display.

```hsplus
object VideoPlayer @subtitle {
  subtitle_src: 'captions.vtt'
  language: 'en'
}
```

| Config               | Type   | Default  | Description      |
| -------------------- | ------ | -------- | ---------------- |
| `font_size`          | number | 24       | Text size        |
| `background_opacity` | number | 0.75     | Background alpha |
| `position`           | string | 'bottom' | 'top', 'bottom'  |

---


## See Also
- [Interaction Traits](/traits/interaction)
- [API Reference](/api/)
