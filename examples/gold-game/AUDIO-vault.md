# AUDIO: THE GOLD GAME — the Vault soundscape

Authored by the /audio discipline (marathon round 1), on the REAL audio substrate. Physics-upward:
model the acoustics, don't just attach clips. Honest about what's shipped vs a build target.

## Acoustics — model the space (`@AudioMaterial` / `@AudioOcclusion` / `@AudioPortal`)
The vault is a vast resonant archive; the surfaces define how it sounds.

| Surface | `@AudioMaterial` | Why |
|---|---|---|
| Gold terraces / rings | `metal` preset | bright, ringing reflections — the vault should *shimmer* metallically |
| Crystal gems + spires | `glass` preset | high-frequency sparkle, low absorption — crystalline air |
| Vault hall / void between tiers | low-absorption custom (long tail) | the cathedral-of-knowledge reverb; sound carries between terraces |

- `@AudioOcclusion` on the terrace masses → an entry's sound on the Diamond peak is muffled (low-pass +
  attenuation) from the Bronze valley, so distance reads acoustically.
- `@AudioPortal` between tier regions → sound transmits/diffracts through the gaps as you ascend, routing
  zone-to-zone (bronze hum bleeding up into the gold terrace).

## Sources — what plays
| Source | Diegetic? | Spatial / 2D | Role | Notes |
|---|---|---|---|---|
| Vault ambient bed | non-diegetic | 2D | base atmosphere | low, breathing drone — "knowledge at rest" |
| Tier music intent | non-diegetic | 2D | mood per elevation | bronze valley = sparse, low, searching → diamond peak = full, luminous, resolved (a *rising* score as you climb) |
| **Graduation cue** (entry ascends a tier) | diegetic | spatial 3D | the signature SFX | a rising crystalline chord at the entry's position — *the* sound of the game; bigger/brighter per tier, a held radiant swell at Diamond |
| Crystal-spire shimmer | diegetic | spatial 3D | skyline life | faint per-spire high-freq glints as the camera/player passes — gives the spires presence |
| Collision ("monster") | diegetic | spatial 3D | conflict | a dissonant clang at the colliding entries; resolves to consonance when the player fixes it |
| Archivist voice presence | diegetic | spatial 3D | character | spatialized footsteps/presence near `TheArchivist` (lines are text today — see gap) |

## Mix budget
Ambient bed (bottom) < tier music < spatial SFX < the graduation cue (the peak moment punches through).
Music ducks under dialogue/graduation cues. Volume in dB; spatial falloff via `max_distance` per source.

## Target & verify
- **Engine target = Godot.** `GodotCompiler` emits real `AudioStreamPlayer3D` (spatial) / `AudioStreamPlayer`
  (2D) with stream path, volume(dB), position, `max_distance`, loop; `audioSourceToGodot()` loads
  `.ogg`/`.wav` from `res://`.
- **Structural verify (the audio analogue of look-dev's screenshot):** compile the `.holo` to Godot and
  confirm the output declares an `AudioStreamPlayer3D` node for each spatial source + the acoustic traits
  attach. The *mix feel* is the one thing only a human listen on the Godot build can confirm — say so, don't assert it.

## Honest gaps (build targets — NOT claimed present, verified 2026-05-22)
- **Only Godot emits audio.** Unity / Babylon / R3F have no audio compiler path — so the **web/R3F preview
  build on the Drive is effectively silent.** Plan audio for the Godot target; if the Drive web build needs
  sound, that's a small WebAudio layer to build (not shipped).
- **No TTS / voice synthesis** at the audio stage — the Archivist's lines are `/narrative` text + LLM, not
  spoken audio yet. Voiced characters are a build target.
- **No adaptive/layered music trait** (`@MusicLayer`) — the "rising score as you climb" needs state-driven
  stems that don't exist yet; today it's static per-tier sources cross-faded by zone. Flag, don't fake.
