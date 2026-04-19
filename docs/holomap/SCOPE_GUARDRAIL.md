# HoloMap scope guardrail (R7)

**Non-goal:** Native **robot / VLA control** (lingbot-va analog) is **out of scope** for HoloMap v1. Reconstruction + manifest + compile targets are in scope; closed-loop **embodied control** is a **later HoloX instance**.

**Authority:** `packages/core/src/reconstruction/RFC-HoloMap.md` §3 Non-goals.

**Process:** If a board task or PR proposes joystick/trajectory **policy** learning, arm **teleop**, or “agent drives robot from HoloMap” without a separate charter, **close or split** the task and link this file + RFC §3 in the handoff.

**Does not block:** Using reconstruction outputs as **static** scene context for separate systems (manual integration), as long as HoloMap itself does not ship control policies.
