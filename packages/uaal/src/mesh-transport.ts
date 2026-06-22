/**
 * uAAL Mesh Transport — make the peer/mesh opcodes real.
 *
 * The uAAL ISA ships peer opcodes — CALL_NODE (0x21, request/response),
 * OP_OFFLOAD (0x23, fire-and-forget), OP_SYNC (0x24, broadcast) — but they are
 * inert extension points until a host registers handlers. This module wires
 * them to a pluggable `MeshTransport`, so a uAAL program running on one fleet
 * node (Jetson / laptop / Vast) can call, offload to, or sync with another.
 * That is "fleet agents communicating with each other" at the language level.
 *
 *   on a node: vm.execute(bytecode-with-CALL_NODE)
 *     -> registered handler -> MeshTransport.request(peer, payload)
 *     -> peer node's request handler -> reply pushed back onto the VM stack
 *
 * The production transport binds `request` -> HoloMesh ask_peer/send_message,
 * `offload` -> a one-way message, `sync` -> gossip. To keep `@holoscript/uaal`
 * dependency-free, that adapter lives in an edge/agent package; this file ships
 * only the interface + an in-process router for tests and single-process fleets.
 *
 * See: docs/spec/spec-vs-reality-gap.md (G3/mesh), MEMORY direction
 * fleet-is-uaal-mesh-of-peers.
 *
 * @module mesh-transport
 */

import { UAALOpCode } from './opcodes';
import type { UAALOperand } from './opcodes';
import type { UAALVirtualMachine } from './vm';

/**
 * Transport seam between a uAAL VM and the rest of the fleet. Implementations:
 * `InMemoryMeshRouter` (this file, tests/single-process) or a HoloMesh-backed
 * adapter (production, binds to ask_peer/send_message/gossip).
 */
export interface MeshTransport {
  /** This node's identity on the mesh (e.g. "jetson-orin-01"). */
  readonly selfNode: string;
  /** Request/response to a peer (CALL_NODE): send a payload, await a reply. */
  request(toNode: string, payload: UAALOperand): Promise<UAALOperand>;
  /** Fire-and-forget dispatch to a peer (OP_OFFLOAD): no reply awaited. */
  offload(toNode: string, payload: UAALOperand): Promise<void>;
  /** Broadcast to all peers (OP_SYNC). Optional. */
  sync?(payload: UAALOperand): Promise<void>;
}

/**
 * Register the mesh opcode handlers on a VM. Handlers are checked before the
 * VM's built-in switch, so this turns the inert mesh opcodes into real calls.
 */
export function registerMeshHandlers(vm: UAALVirtualMachine, transport: MeshTransport): void {
  vm.registerHandler(UAALOpCode.CALL_NODE, async (proxy, operands) => {
    const toNode = String(operands[0] ?? '');
    const payload = operands[1] ?? null;
    const reply = await transport.request(toNode, payload);
    proxy.push(reply);
  });

  vm.registerHandler(UAALOpCode.OP_OFFLOAD, async (_proxy, operands) => {
    const toNode = String(operands[0] ?? '');
    const payload = operands[1] ?? null;
    await transport.offload(toNode, payload);
  });

  vm.registerHandler(UAALOpCode.OP_SYNC, async (_proxy, operands) => {
    if (transport.sync) await transport.sync(operands[0] ?? null);
  });
}

/** What a node does when another node calls it. */
export type MeshRequestHandler = (
  from: string,
  payload: UAALOperand,
) => Promise<UAALOperand> | UAALOperand;

interface MeshEnvelope {
  from: string;
  payload: UAALOperand;
}

/**
 * In-process mesh router — simulates the fleet (Jetson + laptop + Vast) in one
 * process for tests and single-host multi-agent runs. Each connected node gets
 * a `MeshTransport` bound to it; `request` routes synchronously to the target's
 * registered handler; `offload`/`sync` land in the target's inbox.
 */
export class InMemoryMeshRouter {
  private readonly handlers = new Map<string, MeshRequestHandler>();
  private readonly inbox = new Map<string, MeshEnvelope[]>();

  /** Connect a node; returns a MeshTransport bound to it. */
  connect(node: string, onRequest?: MeshRequestHandler): MeshTransport {
    if (onRequest) this.handlers.set(node, onRequest);
    if (!this.inbox.has(node)) this.inbox.set(node, []);
    const router = this;
    return {
      selfNode: node,
      async request(toNode, payload) {
        const handler = router.handlers.get(toNode);
        if (!handler) throw new Error(`uaal mesh: no peer '${toNode}' (request from '${node}')`);
        return await handler(node, payload);
      },
      async offload(toNode, payload) {
        const box = router.inbox.get(toNode);
        if (!box) throw new Error(`uaal mesh: no peer '${toNode}' (offload from '${node}')`);
        box.push({ from: node, payload });
      },
      async sync(payload) {
        for (const [peer, box] of router.inbox) {
          if (peer !== node) box.push({ from: node, payload });
        }
      },
    };
  }

  /** Drain (and clear) a node's offload/sync inbox. */
  drain(node: string): MeshEnvelope[] {
    const box = this.inbox.get(node) ?? [];
    this.inbox.set(node, []);
    return box;
  }

  /** Nodes currently connected to the mesh. */
  nodes(): string[] {
    return [...this.inbox.keys()];
  }
}
