Behaviour name: "Greenhouse Thermostat"

State fields others can see: heaterOn, target, lastReading

Actions (each answers with allowed and outcome; outcome is one of the names listed):
- reading(degrees) — outcomes: heating, idle
- setTarget(target) — outcomes: target_set, target_out_of_range, target_unchanged

Observations (answer only):
- status(viewerId) — answer fields: viewer, heater_on, target, last_reading

Events (event name: payload fields):
- heater_on: at
- heater_off: at
- target_changed: target
