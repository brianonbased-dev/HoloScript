Behaviour name: "Furnace And Air Conditioner"

State fields others can see: mode, setPoint, swing, fan, room, heating, cooling, waiting, minutesSinceCompressorStopped

Actions (each answers with allowed and outcome; outcome is one of the names listed):
Each outcome is marked with its kind:
- accepted: the answer has allowed = true. The action may change state and announce events.
- refused: the answer has allowed = false. The action changes nothing and announces nothing.

- setMode(mode) — outcomes: mode_set (accepted), unknown_mode (refused)
- setTemperature(degrees) — outcomes: temperature_set (accepted), out_of_range (refused)
- setSwing(degrees) — outcomes: swing_set (accepted), bad_swing (refused)
- setFan(setting) — outcomes: fan_set (accepted), unknown_fan (refused)
- reading(room, minutes) — outcomes: heating (accepted), cooling (accepted), waiting (accepted), idle (accepted), bad_minutes (refused)

Observations (answer only):
- status(viewerId) — answer fields: viewer, mode, set_to, room, heat_on, cool_on, fan_running, waiting

Events (event name: payload fields):
