# 2.3 Audio & Sound

Learn how to add immersive spatial audio to your HoloScript scenes.

## Spatial Audio Basics

HoloScript uses positional audio by default — sounds come from where objects are in 3D space.

```holoscript
orb speaker {
  @audio
  sound: "ambient/forest.wav"
  volume: 0.8
  loop: true
  spatial: true
  max_distance: 20.0
}
```

## The `@audio` Trait

The `@audio` trait enables sound playback on any object.

| Property       | Type                          | Description                        |
| -------------- | ----------------------------- | ---------------------------------- |
| `sound`        | string                        | Path to audio file                 |
| `volume`       | float (0-1)                   | Playback volume                    |
| `loop`         | bool                          | Whether to loop                    |
| `spatial`      | bool                          | 3D positional audio                |
| `max_distance` | float                         | Distance at which sound fades to 0 |
| `rolloff`      | `"linear"` \| `"exponential"` | Distance falloff curve             |

## Triggering Sounds on Events

```holoscript
orb button {
  @clickable
  @audio

  on_click: {
    sound: "ui/click.wav"
    volume: 1.0
  }
}
```

## Background Music

Use a non-spatial source for ambient music:

```holoscript
composition "VR Lounge" {
  orb music_player {
    @audio
    sound: "music/chill-lo-fi.ogg"
    loop: true
    spatial: false
    volume: 0.4
  }
}
```

## Audio Zones

Combine `@trigger_zone` with `@audio` for location-based audio:

```holoscript
orb cave_entrance {
  @trigger_zone
  @audio
  radius: 5.0

  on_enter: {
    sound: "ambience/cave-drips.wav"
    loop: true
    fade_in: 2.0
  }

  on_exit: {
    fade_out: 1.5
    stop_sound: true
  }
}
```

## Audio Effects

Apply real-time DSP effects:

```holoscript
orb reverb_zone {
  @audio_fx
  effect: "reverb"
  room_size: 0.8
  dampening: 0.3
  radius: 10.0
}
```

Available effects: `reverb`, `echo`, `lowpass`, `highpass`, `distortion`, `chorus`

## Dynamic Volume Based on Distance

```holoscript
orb proximity_alarm {
  @audio
  @physics
  sound: "sfx/alarm.wav"
  volume_curve: {
    at_distance: [0, 2, 5, 10]
    volume:       [1.0, 0.9, 0.5, 0.0]
  }
}
```

## Best Practices

- Use `.ogg` for looping music (smaller file size)
- Use `.wav` for short one-shot sounds (lower latency)
- Always set `max_distance` for world sounds to avoid audio pollution
- Use `spatial: false` for UI sounds (they should be heard everywhere)
- Keep looping ambience at `volume: 0.3–0.5` so dialogue can be heard

## Exercise

Create a "haunted room" scene with:

1. Background ambient creaking sounds
2. A door that creaks when clicked
3. A fireplace that crackles with audio attenuation
4. An echo effect zone in the center of the room

```holoscript
composition "Haunted Room" {
  orb ambience {
    @audio
    sound: "horror/room-ambience.ogg"
    loop: true
    spatial: false
    volume: 0.3
  }

  orb door {
    @clickable
    @audio
    geometry: "door"
    on_click: {
      sound: "sfx/creak.wav"
    }
  }

  orb fireplace {
    @audio
    @particle_emitter
    sound: "sfx/fire-crackle.ogg"
    loop: true
    spatial: true
    max_distance: 8.0
    rolloff: "exponential"
  }

  orb echo_zone {
    @audio_fx
    @trigger_zone
    effect: "reverb"
    room_size: 0.9
    radius: 6.0
  }
}
```

## Summary

In this lesson, you learned:

- Using `@audio` for spatial and non-spatial sound playback
- Triggering sounds on object events (`on_click`, `on_enter`, `on_exit`)
- Creating audio zones for location-based ambience
- Applying real-time DSP effects (`reverb`, `echo`, and more)
- Controlling volume curves based on distance

## Next Lesson

In [Lesson 2.4: Animation](./04-animation.md), you'll bring objects to life with keyframe timelines, blend shapes, and event-driven animation sequences.

---

**Estimated time:** 35 minutes
**Difficulty:** ⭐⭐ Intermediate
