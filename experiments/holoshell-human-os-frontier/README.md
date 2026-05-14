# HoloShell Human OS Frontier

HoloShell is the hardware wrapper that turns computer operation into HoloScript
experience. AI and specialized agents operate the brittle platform machinery;
humans operate deterministic, visible, auditable workflows.

This experiment space feeds the `HoloShell Human OS Frontier` automation. It is
not a product implementation yet. It is the place to pressure-test whether files,
apps, cloud services, local processes, devices, agents, and HoloLand worlds can
be wrapped as `.holo`, `.hs`, and `.hsplus` experiences that non-technical people
can understand and control.

## Thesis

HoloShell should make the computer feel like a buildable world instead of a stack
of hidden platform rules.

- Google, Microsoft, Apple, browsers, cloud apps, filesystems, terminals, package
  managers, GPUs, devices, and agents can all remain complex underneath.
- The human-facing layer should be deterministic: visible plan, stable controls,
  inspectable source, receipts, rollback, replay, and clear failure states.
- More agents on the same hardware should improve the experience when HoloShell
  coordinates them through roles, receipts, and HoloScript source instead of
  exposing raw agent chaos to the user.

## Automation Loop

Each run should pick one ordinary computer workflow that is still too technical,
then ask how HoloShell should wrap it.

1. Define the human job in plain language.
2. Identify the hidden platform machinery: files, apps, accounts, APIs, commands,
   devices, permissions, local services, and agents.
3. Design the deterministic HoloScript experience:
   - `.holo` for the visible room, controls, timeline, status, and failure states.
   - `.hsplus` for policy, state machines, agent roles, permissions, and receipts.
   - `.hs` for data pipelines, command orchestration, validation, and replay.
4. Check what HoloScript already provides and what HoloLand could embody.
5. Classify the gaps:
   - HoloScript substrate gap
   - HoloLand product/world gap
   - HoloShell hardware-wrapper gap
   - multi-agent coordination gap
   - deterministic UX/receipt gap
6. File actionable tasks with evidence when a gap is real.

## Candidate Workflows

- Prepare my computer to build a HoloLand world.
- Organize my desktop and downloads into meaningful collections.
- Explain why my computer is slow and offer safe actions.
- Back up family photos with dedupe, encryption, and receipts.
- Turn a folder of assets into a playable HoloLand shard.
- Connect Gmail, Drive, local files, GitHub, and a spreadsheet into one workflow.
- Run a build/test/fix loop while showing every agent's role and receipt.
- Operate a robot, printer, headset, or local device through safety envelopes.
- Convert a terminal-only developer task into a spatial non-developer control room.

## Scorecard

Use this scorecard before claiming an idea works.

| Axis | Question |
|---|---|
| Human determinism | Can the user see what will happen before it happens? |
| Non-developer clarity | Could a non-technical person operate it without terminal/API knowledge? |
| Hardware reality | Does it touch real local machine, app, file, device, GPU, or service state? |
| AI containment | Is AI operating behind a visible plan with receipts instead of freewheeling? |
| HoloScript source | Is the workflow represented in `.holo`, `.hs`, or `.hsplus`? |
| Multi-agent value | Do extra agents make the outcome clearer, faster, safer, or more capable? |
| Reversibility | Can the action be replayed, inspected, rolled back, or explained? |
| HoloLand path | Can the experience become a world, room, NPC, tool, quest, or creator surface? |

## First Flagship Scenario

Start with:

> "Make this computer ready to build a HoloLand world, use my local files, verify
> the result works, and show me what changed."

Behind the scenes, specialized agents can inspect dependencies, run local
commands, query repo intelligence, validate `.holo/.hs/.hsplus`, verify rendering,
and file tasks. The human-facing output should be a deterministic HoloShell room:
steps, controls, artifacts, warnings, receipts, rollback notes, and a "make it
better next run" path.
