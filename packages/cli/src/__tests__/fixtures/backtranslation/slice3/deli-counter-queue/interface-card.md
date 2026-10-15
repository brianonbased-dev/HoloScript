Behaviour name: "Deli Counter Queue"

State fields others can see: waitingNormal, waitingPriority, open, nextNumber

Actions (each answers with allowed and outcome; outcome is one of the names listed):
Each outcome is marked with its kind:
- accepted: the answer has allowed = true. The action may change state and announce events.
- refused: the answer has allowed = false. The action changes nothing and announces nothing.

- join(kind) — outcomes: joined (accepted), joined_bumping_normal (accepted), counter_closed (refused), unknown_kind (refused), queue_full (refused)
- serve() — outcomes: served_priority (accepted), served_normal (accepted), nobody_waiting (refused)
- giveUp(kind) — outcomes: left_queue (accepted), unknown_kind (refused), none_of_that_kind (refused)
- closeJoining() — outcomes: closed (accepted), already_closed (refused)

Observations (answer only):
- board(viewerId) — answer fields: viewer, waiting_normal, waiting_priority, open, next_number

Events (event name: payload fields):
- bumped: kind
- ticket_taken: number, kind
- now_serving: kind
- gave_up: kind
- joining_closed: still_waiting
