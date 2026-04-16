import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  Node,
  Edge,
  MarkerType,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

// ---------------------------------------------------------------------------
// Custom Node Types
// ---------------------------------------------------------------------------

function CoordinatorNode({ data }: { data: { label: string; active: boolean } }) {
  return (
    <div
      className={`rounded-xl border-2 bg-[#0d0d14] p-4 text-center transition-all ${
        data.active
          ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
          : 'border-studio-border'
      }`}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 w-3 h-3" />
      <div className="flex flex-col items-center gap-2">
        <div
          className={`h-4 w-4 rounded-full ${
            data.active ? 'bg-purple-400 animate-pulse' : 'bg-studio-muted'
          }`}
        />
        <div className="font-bold text-white text-sm">{data.label}</div>
        <div className="text-[10px] text-purple-400 uppercase tracking-wider">Coordinator</div>
      </div>
    </div>
  );
}

function TentacleNode({
  data,
}: {
  data: { label: string; status: 'running' | 'idle' | 'error'; traits: string[] };
}) {
  const isRunning = data.status === 'running';
  const isError = data.status === 'error';

  let borderColor = 'border-studio-border';
  let glowColor = '';
  let dotColor = 'bg-yellow-400';

  if (isRunning) {
    borderColor = 'border-green-500';
    glowColor = 'shadow-[0_0_10px_rgba(34,197,94,0.3)]';
    dotColor = 'bg-green-400 animate-pulse';
  } else if (isError) {
    borderColor = 'border-red-500';
    glowColor = 'shadow-[0_0_10px_rgba(239,68,68,0.3)]';
    dotColor = 'bg-red-400';
  }

  return (
    <div
      className={`rounded-lg border bg-[#111827] p-3 transition-all w-48 ${borderColor} ${glowColor}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-studio-muted" />
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
        <div className="text-xs font-semibold text-white truncate" title={data.label}>
          {data.label}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {data.traits.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded bg-studio-panel px-1 py-0.5 text-[8px] text-studio-muted"
          >
            @{t}
          </span>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = {
  coordinator: CoordinatorNode,
  tentacle: TentacleNode,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SkillData {
  name: string;
  status: 'running' | 'idle' | 'error';
  traits: string[];
}

interface HoloClawSpatialGridProps {
  skills: SkillData[];
}

export function HoloClawSpatialGrid({ skills }: HoloClawSpatialGridProps) {
  // We use useMemo to map the skills from the prop into a node grid graph.
  const { nodes, edges } = useMemo(() => {
    const nds: Node[] = [];
    const eds: Edge[] = [];

    // The central Octopus/Coordinator Node
    nds.push({
      id: 'coordinator',
      type: 'coordinator',
      position: { x: 300, y: 50 },
      data: {
        label: 'HoloClaw Engine',
        active: skills.some((s) => s.status === 'running'),
      },
      draggable: false,
    });

    // We map out the tentacles in a semi-circle or grid row underneath it
    const startX = 50;
    const spacingX = 220;
    const rowYStart = 200;

    skills.forEach((skill, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const xPos = startX + col * spacingX + (row % 2 === 0 ? 0 : 50);
      const yPos = rowYStart + row * 120;

      const nodeId = `tentacle-${i}`;
      nds.push({
        id: nodeId,
        type: 'tentacle',
        position: { x: xPos, y: yPos },
        data: {
          label: skill.name,
          status: skill.status,
          traits: skill.traits,
        },
      });

      eds.push({
        id: `edge-coord-${nodeId}`,
        source: 'coordinator',
        target: nodeId,
        animated: skill.status === 'running',
        style: { stroke: skill.status === 'running' ? '#10B981' : '#475569', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: skill.status === 'running' ? '#10B981' : '#475569',
        },
      });
    });

    return { nodes: nds, edges: eds };
  }, [skills]);

  return (
    <div className="h-full w-full bg-[#0d0d14] rounded-lg border border-studio-border overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#334155" />
        <Controls
          className="border-studio-border bg-[#0d0d14] fill-white"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}
