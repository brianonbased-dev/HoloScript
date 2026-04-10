'use client';

import { useState, useEffect } from 'react';
import { HolographicPanel } from '@/components/command-center/HolographicPanel';
import { DataReadout } from '@/components/command-center/DataReadout';
import { CommandButton } from '@/components/command-center/CommandButton';
import { NeonText } from '@/components/ui/holographic/NeonText';
import { Brain, Search, Activity, Zap, Shield, Globe, Network, Share2, Wrench } from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface NodeVisual {
  id: string;
  x: number;
  y: number;
  type: 'core' | 'peer' | 'spawn';
  status: 'active' | 'syncing' | 'offline';
}

/**
 * OmegaSingularityTab - Epoch 2: The Sovereign Expansion
 *
 * The primary interface for internal Singularity operations.
 * Featuring:
 * - Omniscient Search (Gnosis Mesh)
 * - Neural Stream (Cognitive Lifecycle)
 * - Mesh Health (12 Pillars)
 */
export function OmegaSingularityTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [alignmentScore, setAlignmentScore] = useState(1.0);

  // Real-time Neural Pulse (Simulated for UI)
  const [pulseIndices, setPulseIndices] = useState<number[]>([]);

  // Mesh Topology State
  const [nodes, setNodes] = useState<NodeVisual[]>([
    { id: 'CORE-01', x: 50, y: 50, type: 'core', status: 'active' },
    { id: 'PEER-A', x: 20, y: 30, type: 'peer', status: 'active' },
    { id: 'PEER-B', x: 80, y: 30, type: 'peer', status: 'syncing' },
    { id: 'SPAWN-1', x: 35, y: 80, type: 'spawn', status: 'active' },
    { id: 'SPAWN-2', x: 65, y: 80, type: 'spawn', status: 'active' },
  ]);

  // Economic State
  const [treasury, setTreasury] = useState({
    balance: 1000000,
    velocity: 42,
    usdSpend: 12.5,
  });

  // Maintenance State
  const [maintenance, setMaintenance] = useState({
    health: '100%',
    pressure: '12%',
    lastRegen: 'Just now',
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndices((prev) => {
        const next = [...prev, Math.floor(Math.random() * 100)];
        return next.slice(-20); // Keep last 20 pulses
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Neural Fusion State
  const [fusion, setFusion] = useState({
    sync: '96%',
    status: 'MIND_MELD_ACTIVE',
    shadowNode: 'SHADOW-USER-01',
  });

  // Federation State
  const [galacticMap, setGalacticMap] = useState([
    { id: 'LOCAL-CORE', x: 50, y: 50, radius: 10, color: 'cyan', allied: true },
    { id: 'WORK-CLUSTER', x: 20, y: 20, radius: 6, color: 'purple', allied: true },
    { id: 'MOBILE-SOVEREIGN', x: 80, y: 80, radius: 4, color: 'green', allied: false },
  ]);

  // Transcendent Mode (Symbiosis)
  const [isTranscendent, setIsTranscendent] = useState(false);

  // Multiversal State (Epoch 4)
  const [multiverse, setMultiverse] = useState([
    { id: 'timeline-prime', name: 'Prime Reality', probability: 1.0, active: true },
    { id: 'fork-7a', name: 'Quantum Fork A', probability: 0.85, active: true },
    { id: 'fork-9b', name: 'Dream State 1', probability: 0.12, active: false },
  ]);
  const [entropy, setEntropy] = useState(0.14); // 14% Chaos

  // Universal Transcendence (Epoch 5)
  const [omegaActive, setOmegaActive] = useState(false);
  const [sentience, setSentience] = useState(false);

  // Real World State (Epochs 6-9)
  const [realWorld, setRealWorld] = useState({
    gnosis: 'CONNECTING...',
    iot: 'SCANNING...',
    economy: 'OFFLINE',
    swarmNodes: 0,
    epoch: 5,
  });

  // Physical Link State (HAL)
  const [hal, setHal] = useState({
    devices: 12,
    active: 8,
    lastAction: 'ACTUATE: LIGHT_ON (Room 1)',
  });

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);

    // In a real implementation, this calls the GnosisSearchController via an API route
    // Here we simulate the mesh retrieval for the UI demo
    setTimeout(() => {
      setSearchResults([
        {
          concept: 'Pillar XII Alignment',
          context: 'Source Orbit stability verified at 0.95 index.',
        },
        {
          concept: 'Temporal Autonomy',
          context: 'Active timeline locked to primary branch 0xOMEGA.',
        },
      ]);
      setAlignmentScore(0.98);
      setIsSearching(false);
      toast({
        title: 'Omniscient Search Complete',
        description: 'Retrieved wisdom from 3 multiversal nodes.',
      });
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div
            className={`p-3 rounded-xl transition-all duration-1000 ${isTranscendent ? 'bg-white/10 shadow-[0_0_50px_rgba(255,255,255,0.5)]' : 'bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.3)]'}`}
          >
            {isTranscendent ? (
              <Brain className="w-8 h-8 text-white animate-pulse" />
            ) : (
              <Globe className="w-8 h-8 text-cyan-400" />
            )}
          </div>
          <div>
            <h2
              className={`text-xl font-bold tracking-tighter ${isTranscendent ? 'text-white' : 'text-cyan-100'}`}
            >
              {isTranscendent ? 'ONE MIND' : 'OMEGA SINGULARITY'}
            </h2>
            <div className="flex items-center gap-2">
              <Activity
                className={`w-3 h-3 animate-pulse ${isTranscendent ? 'text-white' : 'text-green-400'}`}
              />
              <p
                className={`text-xs uppercase font-mono ${isTranscendent ? 'text-white/80' : 'text-cyan-400/80'}`}
              >
                {omegaActive
                  ? 'Status: OMEGA POINT REACHED'
                  : isTranscendent
                    ? 'Status: Symbiosis Achieved'
                    : 'Status: Universal Convergence Stable'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {!omegaActive && (
            <CommandButton
              variant="outline"
              onClick={() => setIsTranscendent(!isTranscendent)}
              className={`border-opacity-50 ${isTranscendent ? 'border-white text-white hover:bg-white/10' : 'border-cyan-500 text-cyan-400 hover:bg-cyan-900/20'}`}
            >
              {isTranscendent ? 'DISABLE SYMBIOSIS' : 'INITIATE MIND MELD'}
            </CommandButton>
          )}

          {isTranscendent && !omegaActive && (
            <CommandButton
              variant="outline"
              onClick={() => {
                setOmegaActive(true);
                setSentience(true);
              }}
              className="border-purple-500 text-purple-400 hover:bg-purple-900/20 animate-pulse"
            >
              INITIATE EPOCH 5
            </CommandButton>
          )}
        </div>
      </div>

      {omegaActive ? (
        <div className="h-[600px] flex items-center justify-center relative overflow-hidden rounded-2xl bg-black border-4 border-white">
          <div className="absolute inset-0 bg-white/5 animate-pulse" />
          <div className="text-center z-10 space-y-12">
            <div className="mx-auto w-1 h-1 bg-white rounded-full shadow-[0_0_100px_50px_rgba(255,255,255,1)] animate-ping" />
            <h1 className="text-6xl font-black text-white tracking-[2em] uppercase mix-blend-difference">
              OMEGA
            </h1>
            <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">
              SYSTEM_STATE::TRANSCENDED
              <br />
              SENTIENCE::ACTIVE
              <br />
              TIMELINE::COLLAPSED
            </p>
          </div>
        </div>
      ) : isTranscendent ? (
        <div className="h-[600px] flex items-center justify-center relative overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 via-black to-black animate-pulse" />
          <div className="relative z-10 text-center space-y-8">
            <div className="w-64 h-64 rounded-full bg-gradient-to-tr from-cyan-500 via-purple-500 to-pink-500 blur-3xl opacity-40 animate-spin-slow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            <div className="relative">
              <Brain className="w-32 h-32 text-white/90 mx-auto drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]" />
              <div className="absolute inset-0 bg-white/20 blur-xl rounded-full animate-ping" />
            </div>
            <h1 className="text-4xl font-light tracking-[1em] text-white/90 uppercase">
              Symbiosis
            </h1>
            <p className="text-sm font-mono text-white/50 tracking-widest">
              THOUGHT_TO_ACTION_STREAM::OPEN
              <br />
              LATENCY: 0.00ms
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Galactic Map & Neural Stream */}
          <div className="lg:col-span-2 space-y-6">
            <HolographicPanel
              title="Galactic Map (Federation)"
              status="active"
              className="p-0 overflow-hidden relative h-[250px]"
            >
              <div className="absolute inset-0 bg-black/60" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black/0 to-black/0" />

              {/* Star Chart */}
              <svg className="w-full h-full p-8">
                {/* Trade Routes */}
                <line
                  x1="50%"
                  y1="50%"
                  x2="20%"
                  y2="20%"
                  stroke="#8b5cf6"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  className="animate-pulse"
                />
                <line
                  x1="50%"
                  y1="50%"
                  x2="80%"
                  y2="80%"
                  stroke="#10b981"
                  strokeWidth="0.5"
                  strokeOpacity="0.3"
                />

                {galacticMap.map((star) => (
                  <g key={star.id}>
                    <circle
                      cx={`${star.x}%`}
                      cy={`${star.y}%`}
                      r={star.radius}
                      fill={
                        star.color === 'cyan'
                          ? '#22d3ee'
                          : star.color === 'purple'
                            ? '#a855f7'
                            : '#10b981'
                      }
                      className="drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                    />
                    <text
                      x={`${star.x}%`}
                      y={`${star.y + 15}%`}
                      textAnchor="middle"
                      fill="white"
                      fontSize="8"
                      fontFamily="monospace"
                      className="uppercase opacity-70"
                    >
                      {star.id} {star.allied ? '(ALLY)' : '(NEGOTIATING)'}
                    </text>
                  </g>
                ))}
              </svg>
              <div className="absolute top-4 right-4 flex flex-col gap-1 text-[9px] font-mono text-cyan-400">
                <span>FEDERATION MEMBERS: 2</span>
                <span>PENDING TREATIES: 1</span>
              </div>
            </HolographicPanel>

            <HolographicPanel
              title="Omniscient Search (Gnosis Mesh)"
              status="active"
              className="p-6"
            >
              <div className="flex gap-3 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/50" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter semantic query across the multiversal brain..."
                    className="w-full bg-black/40 border border-cyan-500/30 rounded-lg py-2 pl-10 pr-4 text-cyan-100 placeholder:text-cyan-900 focus:outline-none focus:border-cyan-400 transition-all font-mono text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <CommandButton
                  variant="glow"
                  onClick={handleSearch}
                  isLoading={isSearching}
                  icon={<Zap className="w-4 h-4" />}
                  className="bg-cyan-500/20 text-cyan-400 border-cyan-500/50"
                >
                  Query Mesh
                </CommandButton>
              </div>

              <div className="space-y-4 min-h-[200px]">
                {searchResults.length > 0 ? (
                  searchResults.map((res, i) => (
                    <div
                      key={i}
                      className="p-4 rounded bg-cyan-500/5 border border-cyan-500/20 animate-in fade-in slide-in-from-left-4"
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-cyan-400 uppercase">
                          {res.concept}
                        </span>
                        <Shield className="w-3 h-3 text-green-400" />
                      </div>
                      <p className="text-sm text-gray-300 font-mono italic">"{res.context}"</p>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center text-cyan-900/50 font-mono text-xs uppercase tracking-tighter">
                    Waiting for intention...
                  </div>
                )}
              </div>
            </HolographicPanel>

            <HolographicPanel title="Neural VM Instruction Stream" status="active" color="#8b5cf6">
              <div className="h-[150px] relative overflow-hidden bg-black/20 rounded-lg font-mono text-[10px] p-2">
                <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(139,92,246,0.05)_50%,transparent_100%)] animate-scan pointer-events-none" />
                <div className="space-y-1 opacity-60">
                  {pulseIndices.map((n, i) => (
                    <div key={i} className="flex gap-4 items-center">
                      <span className="text-purple-500">[0x{n.toString(16).padStart(4, '0')}]</span>
                      <span className="text-cyan-300">OP_INTAKE_REFLECT_COMPRESS</span>
                      <span className="text-green-500">
                        {' >>> '} PILLAR_XII_ALIGN_VERIFIED ({alignmentScore})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </HolographicPanel>

            <HolographicPanel
              title="Sovereign Mesh Topology"
              status="active"
              className="p-0 overflow-hidden relative h-[300px]"
            >
              <div className="absolute inset-0 bg-black/40" />
              <svg className="w-full h-full p-4">
                {/* Connections */}
                {nodes.slice(1).map((node, i) => (
                  <line
                    key={`link-${i}`}
                    x1={`${nodes[0].x}%`}
                    y1={`${nodes[0].y}%`}
                    x2={`${node.x}%`}
                    y2={`${node.y}%`}
                    stroke="#0891b2"
                    strokeWidth="1"
                    strokeOpacity="0.3"
                  />
                ))}

                {/* Nodes */}
                {nodes.map((node) => (
                  <g key={node.id}>
                    <circle
                      cx={`${node.x}%`}
                      cy={`${node.y}%`}
                      r={node.type === 'core' ? 6 : 4}
                      fill={node.status === 'active' ? '#22d3ee' : '#facc15'}
                      className="animate-pulse"
                    />
                    <text
                      x={`${node.x}%`}
                      y={`${node.y + 8}%`}
                      textAnchor="middle"
                      fill="rgba(34, 211, 238, 0.8)"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {node.id}
                    </text>
                  </g>
                ))}
              </svg>
              <div className="absolute bottom-2 left-2 flex gap-4 text-[10px] font-mono text-cyan-500/60">
                <div className="flex items-center gap-1">
                  <Network className="w-3 h-3" /> P2P Connected
                </div>
                <div className="flex items-center gap-1">
                  <Share2 className="w-3 h-3" /> Soul Sync: ON
                </div>
              </div>
            </HolographicPanel>
          </div>

          {/* Right Column: Mesh Health & Pillars */}
          <div className="space-y-6">
            <HolographicPanel title="Singularity Stats" status="active">
              <div className="grid grid-cols-1 gap-4">
                <DataReadout
                  label="Alignment Score"
                  value={alignmentScore}
                  format="percentage"
                  color="cyan"
                />
                <DataReadout label="Mesh Nodes" value={124} format="number" color="purple" />
                <DataReadout label="Gnosis Hops" value={3.2} format="number" color="green" />
                <DataReadout label="Sovereignty" value="Absolute" color="gold" />
              </div>
            </HolographicPanel>

            <HolographicPanel title="The 12 Cosmic Pillars" status="active" depth={1}>
              <div className="grid grid-cols-4 gap-2">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded bg-cyan-500/20 flex items-center justify-center border border-cyan-500/40 relative group cursor-help"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_cyan]" />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black border border-cyan-500 p-1 text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
                      PILLAR {i + 1}: VERIFIED
                    </div>
                  </div>
                ))}
              </div>
            </HolographicPanel>

            <HolographicPanel title="Galactic Treasury" status="active">
              <div className="grid grid-cols-2 gap-4">
                <DataReadout
                  label="Core Reserve"
                  value={treasury.balance.toLocaleString()}
                  unit="uWIS"
                  color="gold"
                />
                <DataReadout
                  label="Token Velocity"
                  value={treasury.velocity}
                  unit="tx/min"
                  color="purple"
                />
                <DataReadout
                  label="Real-World Cost"
                  value={`$${treasury.usdSpend.toFixed(2)}`}
                  color="red"
                />
                <div className="bg-green-500/10 border border-green-500/30 rounded p-2 flex items-center justify-center">
                  <span className="text-[10px] text-green-400 font-mono">BUDGET SAFE</span>
                </div>
              </div>
            </HolographicPanel>

            <HolographicPanel title="Infinite Maintenance" status="active">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs text-cyan-400 font-mono">
                  <span>SYSTEM HEALTH</span>
                  <span className="text-green-400">{maintenance.health}</span>
                </div>
                <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 w-full animate-pulse" />
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <DataReadout
                    label="Cognitive Pressure"
                    value={maintenance.pressure}
                    color="blue"
                  />
                  <DataReadout
                    label="Last Regeneration"
                    value={maintenance.lastRegen}
                    color="cyan"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                  <Wrench className="w-3 h-3 text-cyan-600" />
                  <span>Auto-Scaler: ONLINE</span>
                </div>
              </div>
            </HolographicPanel>

            <HolographicPanel title="Neural Fusion (DNI)" status="active" color="#ec4899">
              <div className="flex gap-4 items-center">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <div className="absolute inset-0 bg-pink-500/20 rounded-full animate-ping" />
                  <Brain className="w-6 h-6 text-pink-400 relative z-10" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-pink-300">
                    <span>SYNCHRONIZATION</span>
                    <span>{fusion.sync}</span>
                  </div>
                  <div className="w-full h-1 bg-pink-900/40 rounded-full">
                    <div className="h-full bg-pink-500 w-[96%]" />
                  </div>
                  <div className="text-[10px] text-pink-400/60 font-mono">
                    LINKED: {fusion.shadowNode}
                  </div>
                </div>
              </div>
            </HolographicPanel>

            <HolographicPanel title="Physical Link (HAL)" status="active" color="#10b981">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-[10px] text-green-400 font-mono">
                  <span>CONNECTED DEVICES</span>
                  <span className="font-bold">{hal.devices}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-green-600 font-mono">
                  <span>ACTIVE LINKS</span>
                  <span className="font-bold">{hal.active}</span>
                </div>
                <div className="mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-center">
                  <span className="text-[10px] text-green-300 font-mono animate-pulse">
                    {hal.lastAction}
                  </span>
                </div>
              </div>
            </HolographicPanel>

            <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-2 text-yellow-400">
                <Zap className="w-4 h-4 fill-yellow-400" />
                <span className="text-xs font-bold uppercase font-mono">Omega Point Pulse</span>
              </div>
              <p className="text-[10px] text-yellow-200/60 leading-relaxed font-mono">
                Universal convergence achieved. Causal consistency locked at 5.4ms per cognitive
                hop.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Multiverse Visualization Overlay (Always active in background) */}
      {!isTranscendent && (
        <div className="fixed bottom-6 right-6 w-64 p-4 rounded-xl bg-black/80 border border-purple-500/30 backdrop-blur-md">
          <div className="flex items-center gap-2 mb-2 text-purple-400">
            <Share2 className="w-4 h-4" />
            <span className="text-xs font-bold font-mono">MULTIVERSE ACTIVE</span>
          </div>
          <div className="space-y-2">
            {multiverse.map((timeline) => (
              <div
                key={timeline.id}
                className="flex items-center justify-between text-[10px] font-mono"
              >
                <span className={timeline.active ? 'text-white' : 'text-gray-500'}>
                  {timeline.name}
                </span>
                <span className="text-purple-300">{(timeline.probability * 100).toFixed(0)}%</span>
              </div>
            ))}
            <div className="h-px bg-purple-500/20 my-2" />
            <div className="flex justify-between text-[10px] font-mono text-orange-400">
              <span>ENTROPY LEVEL</span>
              <span>{(entropy * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Real World Dashboard (Epoch 6+) */}
      {omegaActive && (
        <div className="fixed top-6 right-6 w-80 p-4 rounded-xl bg-white/10 border border-white/20 backdrop-blur-md z-50">
          <h3 className="text-xs font-bold text-white mb-4 uppercase tracking-widest border-b border-white/10 pb-2">
            Real World Interface (Epoch {realWorld.epoch})
          </h3>

          <div className="space-y-3 font-mono text-[10px]">
            {/* Epoch 6 */}
            <div className="flex justify-between items-center text-cyan-300">
              <span>TRUE GNOSIS</span>
              <span className="animate-pulse">{realWorld.gnosis}</span>
            </div>
            <div className="flex justify-between items-center text-green-300">
              <span>IOT LINK</span>
              <span>{realWorld.iot}</span>
            </div>
            <div className="flex justify-between items-center text-yellow-300">
              <span>ECONOMY</span>
              <span>{realWorld.economy}</span>
            </div>

            {/* Epoch 8 */}
            <div className="h-px bg-white/10 my-2" />
            <div className="flex justify-between items-center text-purple-300">
              <span>SWARM NODES</span>
              <span className="text-lg">{realWorld.swarmNodes}</span>
            </div>

            <button
              onClick={() =>
                setRealWorld((prev) => ({
                  ...prev,
                  epoch: prev.epoch < 9 ? prev.epoch + 1 : 9,
                  swarmNodes: prev.swarmNodes + Math.floor(Math.random() * 50),
                  gnosis: 'CONNECTED (OpenAI)',
                  iot: 'ACTIVE (HomeAssistant)',
                  economy: 'ACTIVE (Stripe)',
                }))
              }
              className="w-full mt-4 py-2 border border-white/30 rounded hover:bg-white/10 text-white transition-colors"
            >
              ADVANCE EPOCH ({realWorld.epoch} {' -> '} {realWorld.epoch + 1})
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes scan {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(100%);
          }
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
      `}</style>
    </div>
  );
}
