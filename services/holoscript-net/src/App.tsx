import React, { useState, useEffect, useRef, useCallback } from 'react';


import LiquidBlob from './components/LiquidBlob';
import SpatialBackground from './components/SpatialBackground';
import { MagicMomentWizard } from './components/MagicMomentWizard';

// Icons
const IconCheck = () => (
  <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const IconX = () => (
  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);


// --- Phase 6: Interactive Spatial Presence ---
interface CursorState {
  x: number;
  y: number;
  color: string;
  label: string;
}

const COLORS = ['#00ffff', '#ff00ff', '#00ff88', '#ffaa00', '#8800ff'];
const LABELS = ['👽', '🚀', '💎', '🦄', '👾', '👻', '🤖', '👑'];

function usePresence() {
  const [peers, setPeers] = useState<Record<string, CursorState>>({});
  const [localColor, setLocalColor] = useState(COLORS[0]);
  const [localLabel, setLocalLabel] = useState(LABELS[0]);
  const [localCursor, setLocalCursor] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [scrollY, setScrollY] = useState(0);
  const wsRef = useRef(null as WebSocket | null);
  const myId = useRef(`peer_${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    const wsUrl = window.location.hostname === 'localhost' 
      ? `ws://localhost:3001/socket/presence` 
      : `wss://${window.location.host}/socket/presence`;
      
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'cursor' && data.id !== myId.current) {
          setPeers(prev => ({
            ...prev,
            [data.id]: { x: data.x, y: data.y, color: data.color, label: data.label }
          }));
        }
      } catch (_e) {}
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setLocalCursor({ x: e.clientX, y: e.clientY });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        id: myId.current,
        x: e.clientX,
        y: e.clientY,
        color: localColor,
        label: localLabel
      }));
    }
  }, [localColor, localLabel]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleMouseMove]);

  return { peers, localCursor, scrollY, localColor, setLocalColor, localLabel, setLocalLabel };
}

function LiveCursors({ peers }: { peers: Record<string, CursorState> }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {Object.entries(peers).map(([id, state]) => (
        <div
          key={id}
          className="absolute transition-all duration-150 ease-linear flex flex-col items-center"
          style={{ transform: `translate(${state.x}px, ${state.y}px)`, left: -12, top: -12 }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill={state.color} stroke="white" strokeWidth="2" className="drop-shadow-md">
            <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87c.45 0 .67-.54.35-.85L5.85 3.21a.5.5 0 00-.35-.15z" />
          </svg>
          <div 
            className="mt-1 px-2 py-0.5 rounded text-xs font-bold text-white shadow-lg whitespace-nowrap"
            style={{ backgroundColor: state.color }}
          >
            {state.label}
          </div>
        </div>
      ))}
    </div>
  );
}

const CLI_QUICKSTART = 'npx create-holoscript@latest my-world';
const MCP_CONFIG_BLOCK = `{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.holoscript.net/mcp"]
    }
  }
}`;

export function HoloScriptLandingComponent() {
  const { peers, localCursor, scrollY, localColor, setLocalColor, localLabel, setLocalLabel } = usePresence();
  const [showMagicMoment, setShowMagicMoment] = useState(false);
  const [copiedHint, setCopiedHint] = useState<'cli' | 'mcp' | null>(null);

  const copyText = useCallback(async (label: 'cli' | 'mcp', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHint(label);
      window.setTimeout(() => setCopiedHint(null), 2000);
    } catch (_e) {
      setCopiedHint(null);
    }
  }, []);

  return (
    <div className="holoscript-v6-root w-full relative min-h-screen bg-[#050505] text-white font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      
      {/* Background Simulation Layer - Restored SpatialBackground */}
      <SpatialBackground peers={peers} localCursor={localCursor} scrollY={scrollY} />

      {/* Semantic 2D Foreground Layer - standard DOM elements */}
      <div className="relative z-10 w-full flex flex-col items-center justify-start pointer-events-auto">
        
        <LiveCursors peers={peers} />
        
        {/* Identity Widget */}
        <div className="fixed bottom-6 right-6 z-[90] bg-[#0c0c16]/90 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-2xl flex flex-col gap-3">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Customize Identity</div>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button 
                key={c} onClick={() => setLocalColor(c)}
                className={`w-6 h-6 rounded-full transition-transform ${localColor === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2 text-lg">
            {LABELS.slice(0, 5).map(l => (
              <button 
                key={l} onClick={() => setLocalLabel(l)}
                className={`hover:scale-125 transition-transform ${localLabel === l ? 'opacity-100 scale-125 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'opacity-40'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a1a]/80 backdrop-blur-md border-b border-white/10">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <img src="/logo.svg" alt="HoloScript" className="h-7 w-7" />
              <span>HoloScript</span>
            </a>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-300">
              <a href="/guides" className="hover:text-cyan-400 transition-colors">Docs</a>
              <a href="/guides/quick-start" className="hover:text-cyan-400 transition-colors">Quick Start</a>
              <a href="/examples" className="hover:text-cyan-400 transition-colors">Examples</a>
              <a href="/traits" className="hover:text-cyan-400 transition-colors">Traits</a>
              <a href="https://studio.holoscript.net" className="text-purple-400 hover:text-purple-300 bg-purple-500/10 px-3 py-1.5 rounded-md transition-colors">Studio</a>
              <a href="https://github.com/brianonbased-dev/HoloScript" className="hover:text-cyan-400 transition-colors">GitHub</a>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 w-full overflow-hidden flex flex-col gap-3 p-[12px] semantic-layout-priority">
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/40 to-[#050505]/80"></div>
          </div>
          
          <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-mono mb-8">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              The Open Platform for Spatial Worlds
            </div>
            <div className="flex items-center justify-center gap-6 mb-8 mt-4">
              <img src="/logo.svg" alt="HoloScript" className="h-16 w-16 drop-shadow-[0_0_15px_rgba(0,255,255,0.5)]" />
              <span className="text-2xl text-gray-500 font-light">✕</span>
              <img src="/base-logo.svg" alt="Base" className="h-16 w-16 drop-shadow-[0_0_15px_rgba(0,82,255,0.5)]" />
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6 pb-4 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500">
              Create with AI.<br/>Own what you build.<br/>Ship everywhere.
            </h1>
            
            <p className="max-w-3xl mx-auto text-lg lg:text-xl text-gray-400 mb-10 leading-relaxed">
              Imagine it. Build it. Own it. HoloScript lets anyone create interactive 3D worlds with AI, sell them on an open marketplace, and deploy autonomous agents — all from one platform. No engine lock-in. No code required.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://studio.holoscript.net"
                className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-lg hover:scale-105 transition-transform shadow-[0_0_30px_rgba(0,255,255,0.3)] text-center"
              >
                Open HoloScript Studio
              </a>
              <button
                type="button"
                onClick={() => setShowMagicMoment(true)}
                className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-white/5 border border-white/10 text-white font-bold text-lg hover:bg-white/10 transition-colors"
              >
                Try the wizard
              </button>
              <a href="/guides/quick-start" className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-white/5 border border-white/10 text-white font-bold text-lg hover:bg-white/10 transition-colors text-center">
                Docs: Quick start
              </a>
            </div>
          </div>
        </section>

        {/* First-visit CTAs: CLI + MCP + plugin store */}
        <section className="relative z-10 w-full max-w-4xl mx-auto px-6 pb-12 -mt-2">
          <div className="rounded-2xl border border-cyan-500/25 bg-[#0a0a14]/95 backdrop-blur-md p-6 md:p-8 shadow-[0_0_50px_rgba(0,255,255,0.06)]">
            <h2 className="text-xl md:text-2xl font-bold text-center text-white mb-2">Start in your terminal or IDE</h2>
            <p className="text-center text-gray-400 text-sm mb-8 max-w-2xl mx-auto">
              Scaffold a project with the CLI, paste the MCP block into Claude Code or Cursor for live tools, then browse plugins — or grab a free API key in Studio when you need authenticated MCP calls.
            </p>
            <div className="space-y-6 text-left">
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400/90">CLI</span>
                  <button
                    type="button"
                    onClick={() => copyText('cli', CLI_QUICKSTART)}
                    className="text-xs font-semibold text-cyan-300 hover:text-white px-3 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/30"
                  >
                    {copiedHint === 'cli' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-cyan-200 overflow-x-auto font-mono">
                  <code>{CLI_QUICKSTART}</code>
                </pre>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400/90">MCP config</span>
                  <button
                    type="button"
                    onClick={() => copyText('mcp', MCP_CONFIG_BLOCK)}
                    className="text-xs font-semibold text-purple-200 hover:text-white px-3 py-1 rounded-md bg-purple-500/10 border border-purple-500/30"
                  >
                    {copiedHint === 'mcp' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-black/50 border border-white/10 rounded-xl p-4 text-xs md:text-sm text-gray-200 overflow-x-auto font-mono leading-relaxed">
                  <code>{MCP_CONFIG_BLOCK}</code>
                </pre>
                <p className="mt-2 text-xs text-gray-500">
                  For tools that need auth, set <code className="text-cyan-500/90">HOLOSCRIPT_API_KEY</code> next to this block (get a key from Studio → Account).
                </p>
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3 pt-2">
                <a
                  href="https://studio.holoscript.net/store"
                  className="inline-flex justify-center px-6 py-3 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-semibold text-center hover:opacity-95 transition-opacity shadow-[0_0_24px_rgba(147,51,234,0.25)]"
                >
                  Browse the plugin store
                </a>
                <a
                  href="https://studio.holoscript.net"
                  className="inline-flex justify-center px-6 py-3 rounded-lg bg-white/5 border border-white/15 text-white font-semibold text-center hover:bg-white/10 transition-colors"
                >
                  Studio &amp; API keys
                </a>
                <a
                  href="/guides/quick-start"
                  className="inline-flex justify-center px-6 py-3 rounded-lg bg-transparent border border-cyan-500/30 text-cyan-200 font-semibold text-center hover:bg-cyan-500/10 transition-colors"
                >
                  Read the quick start
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Claim 1: Build Physics-Aware Worlds */}
        <section className="py-24 relative flex flex-col gap-3 w-full p-[12px] semantic-layout-priority border-t border-white/5">
          <div className="max-w-7xl mx-auto px-6 w-full z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left (Claim) */}
              <div>
                <h2 className="text-4xl font-bold mb-6 text-gray-900 leading-tight">
                  Build Physics-Aware Worlds <span className="text-blue-800">Without Boilerplate</span>
                </h2>
                <p className="text-xl text-gray-800 mb-8 font-medium">
                   Creating a live, physics-driven fluid simulation in WebGL takes custom shaders and intense math. With HoloScript's semantic AI traits, it takes one declaration.
                </p>
                <div className="bg-[#0c0c16] border border-white/10 p-6 rounded-xl font-mono text-sm text-left shadow-2xl">
                   <pre className="text-cyan-300 overflow-x-auto">
                     <code>
<span className="text-purple-400">composition</span> <span className="text-green-400">"My World"</span> &#123;<br/>
&nbsp;&nbsp;<span className="text-blue-400">object</span> <span className="text-green-400">"Anomaly"</span> <span className="text-yellow-400">@liquid</span> <span className="text-yellow-400">@distorted</span> &#123;<br/>
&nbsp;&nbsp;&nbsp;&nbsp;turbulence: <span className="text-orange-400">0.8</span><br/>
&nbsp;&nbsp;&nbsp;&nbsp;color: <span className="text-green-400">"#8b5cf6"</span><br/>
&nbsp;&nbsp;&#125;<br/>
&#125;
                     </code>
                   </pre>
                </div>
              </div>
              {/* Right (Evidence) */}
              <div className="lift-card bg-white/5 border border-white/10 rounded-2xl relative h-[420px] shadow-[0_0_30px_rgba(0,255,255,0.05)] overflow-hidden">
                 <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-md bg-black/40 border border-white/10 backdrop-blur-md text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                   <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                   Live Execution
                 </div>
                 <div className="absolute inset-0">
                   <LiquidBlob />
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* Claim 2: 1,800+ Traits Inject Life Instantly */}
        <section className="py-24 bg-[#080812]/40 relative border-y border-white/5 w-full flex flex-col gap-3 p-[12px] semantic-layout-priority">
          <div className="max-w-7xl mx-auto px-6 w-full z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left (Evidence) */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { t: '@grabbable', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' },
                  { t: '@particle_system', color: 'bg-pink-500/10 text-pink-400 border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.1)]' },
                  { t: '@physics', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]' },
                  { t: '@networked', color: 'bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]' },
                ].map((trait, i) => (
                  <div key={i} className={`lift-card p-6 border rounded-xl flex items-center justify-center h-32 hover:scale-105 transition-transform backdrop-blur-sm ${trait.color}`}>
                    <code className="font-mono font-bold text-lg">{trait.t}</code>
                  </div>
                ))}
              </div>

              {/* Right (Claim) */}
              <div>
                <h2 className="text-4xl font-bold mb-6 text-gray-900 leading-tight">
                  <span className="text-purple-900">1,800+ Semantic Traits</span>
                </h2>
                <p className="text-xl text-gray-800 mb-6 leading-relaxed font-medium">
                  Access 99 module communities covering VR, robotics, IoT, AI agents, swarm intelligence, economy, physics, rendering, multiplayer, and more.
                </p>
                <p className="text-xl text-gray-800 leading-relaxed font-medium">
                  Add powerful behaviors purely through simple decorators representing semantic intent, rather than verbose physical configuration.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Claim 3: Live Multi-Agent Sync */}
        <section className="py-24 relative w-full flex flex-col gap-3 p-[12px] semantic-layout-priority">
          <div className="max-w-7xl mx-auto px-6 w-full z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left (Claim) */}
              <div>
                <h2 className="text-4xl font-bold mb-6 text-gray-900 leading-tight">
                  Live <span className="text-green-800">Multi-Agent</span> Sync
                </h2>
                <p className="text-xl text-gray-800 mb-6 leading-relaxed font-medium">
                  Every spatial world automatically syncs state across the network through native CRDTs and WebSocket presence out of the box.
                </p>
                <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 font-mono text-sm shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                   <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></span>
                   Active Peer Connection: WebSocket OK
                </div>
              </div>
              
              {/* Right (Evidence) */}
              <div className="lift-card p-8 bg-white/5 border border-white/10 rounded-2xl relative overflow-hidden group hover:bg-white/10 transition-colors shadow-2xl">
                <span className="absolute top-4 left-4 text-xs font-bold text-gray-500 uppercase tracking-widest z-10 flex items-center gap-2">
                   <span className="text-purple-400">●</span> Sensory Layer
                </span>
                <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/20 rounded-xl group-hover:border-green-400/50 transition-colors mt-6 bg-black/20">
                  <div className="text-4xl mb-4 animate-bounce">{localLabel}</div>
                  <p className="text-gray-400 font-mono text-sm text-center px-4 max-w-sm">
                    You are connected as {localLabel}. <br/><br/>
                    Move your cursor across this screen to broadcast your presence to the global peer mesh and see others in real-time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Problem & Solution */}
        <section className="py-24 bg-[#080812]/40 relative border-y border-white/5 w-full flex flex-col p-[12px] semantic-layout-priority">
          <div className="max-w-7xl mx-auto px-6 w-full z-10">
            <div className="grid lg:grid-cols-2 gap-16">
              
              {/* The Problem */}
              <div>
                <h2 className="text-3xl font-bold mb-8 text-gray-900 flex items-center gap-3">
                  <span className="text-red-800">The Problem</span> with VR Development
                </h2>
                <div className="space-y-8">
                  <div className="bg-white/40 border border-black/10 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-red-800 mb-2 flex items-center gap-2"><IconX /> Steep Learning Curve</h3>
                    <p className="text-gray-800 font-medium">Traditional VR tools like Unity or Unreal require months of study before you can build even simple experiences. Complex SDKs, engine-specific APIs, and verbose code block creativity.</p>
                  </div>
                  <div className="bg-white/40 border border-black/10 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-red-800 mb-2 flex items-center gap-2"><IconX /> Too Much Boilerplate</h3>
                    <p className="text-gray-800 font-medium">Creating a simple 3D scene requires 200+ lines of setup code. Scene graphs, materials, renderers, cameras — endless configuration before you see results.</p>
                  </div>
                  <div className="bg-white/40 border border-black/10 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-red-800 mb-2 flex items-center gap-2"><IconX /> Platform Lock-in</h3>
                    <p className="text-gray-800 font-medium">Build for Unity, can't use in Unreal. Target VR but can't reach robotics or IoT. No universal language means rewriting for every platform.</p>
                  </div>
                </div>
              </div>

              {/* The Solution */}
              <div>
                <h2 className="text-3xl font-bold mb-8 text-gray-900 flex items-center gap-3">
                  <span className="text-cyan-800">The HoloScript</span> Solution
                </h2>
                <div className="space-y-8">
                  <div className="bg-white/40 border border-cyan-800/20 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-cyan-800 mb-2 flex items-center gap-2"><IconCheck /> Write It</h3>
                    <p className="text-gray-800 font-medium">Describe your VR world in plain .holo files using intuitive syntax. No complex APIs or framework knowledge required. Just write what you want to see.</p>
                  </div>
                  <div className="bg-white/40 border border-cyan-800/20 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-cyan-800 mb-2 flex items-center gap-2"><IconCheck /> See It</h3>
                    <p className="text-gray-800 font-medium">Instant browser preview with WebXR support. See changes in real-time. Test on desktop, mobile, or VR headset without exports or compilation steps.</p>
                  </div>
                  <div className="bg-white/40 border border-cyan-800/20 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-cyan-800 mb-2 flex items-center gap-2"><IconCheck /> Ship It</h3>
                    <p className="text-gray-800 font-medium">Compile to 25+ targets: Unity, Unreal, Godot, VRChat, WebGPU, visionOS, ROS 2, and more. Or share a link that runs in any browser. True write-once, deploy-anywhere.</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Studio / More Than A Language */}
        <section className="py-24 relative overflow-hidden w-full flex flex-col p-[12px] semantic-layout-priority">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/10 blur-[120px] rounded-full pointer-events-none"></div>
          
          <div className="max-w-7xl mx-auto px-6 relative z-10 text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">No Code? No Problem.</h2>
            <p className="text-xl text-gray-800 max-w-3xl mx-auto font-medium">
              HoloScript Studio lets you build 3D scenes just by describing them. Type what you want, see it in real-time. No install, no setup, no coding required.
            </p>
          </div>
          
          {/* Interactive DOM Wizard Mockup replacing the broken image and redundant CTA link */}
          <div className="max-w-4xl mx-auto px-6 mb-24 relative z-10 w-full">
            <div className="w-full rounded-3xl border border-white/20 bg-black/50 backdrop-blur-2xl shadow-[0_0_80px_rgba(168,85,247,0.2)] overflow-hidden flex flex-col">
              <div className="h-12 border-b border-white/10 flex items-center px-4 gap-3 bg-white/5">
                <div className="flex gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-red-400"></div>
                  <div className="w-3.5 h-3.5 rounded-full bg-yellow-400"></div>
                  <div className="w-3.5 h-3.5 rounded-full bg-green-400"></div>
                </div>
                <div className="text-gray-300 text-xs font-mono mx-auto pr-10 tracking-widest uppercase opacity-70">Studio_Wizard_Environment</div>
              </div>
              <div className="p-12 flex flex-col items-center justify-center min-h-[350px]">
                <div className="text-6xl mb-6 relative z-10 drop-shadow-[0_0_30px_rgba(0,255,255,1)]">✨</div>
                <h3 className="text-3xl font-extrabold text-white mb-8 tracking-tight drop-shadow-md">What do you want to build?</h3>
                <div className="w-full max-w-2xl relative transform hover:scale-105 transition-transform duration-500 ease-out z-20">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full blur-xl opacity-40 animate-pulse"></div>
                  <div className="relative">
                    <input type="text" placeholder="e.g. A neon cyberpunk garden with a rain physics simulation..." className="w-full bg-[#0a0a0a]/90 border border-white/20 rounded-full py-5 pl-8 pr-40 text-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 shadow-2xl backdrop-blur-md pointer-events-none" readOnly />
                    <button onClick={() => setShowMagicMoment(true)} className="absolute right-2 top-2 bottom-2 bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold rounded-full px-8 flex items-center justify-center hover:opacity-90 transition-all font-lg shadow-[0_0_20px_rgba(0,255,255,0.4)] z-50">
                      Generate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-6 text-center relative z-10 pb-8">
            <h2 className="text-4xl font-bold mb-6 text-gray-900 leading-tight">
              HoloScript <span className="text-cyan-800">Absorb</span>: Universal Codebase Intelligence
            </h2>
            <p className="text-xl text-gray-800 mb-10 leading-relaxed max-w-3xl mx-auto font-medium">
              Convert any TS/JS monorepo into an interactive spatial knowledge graph. Used natively by autonomous agents, it maps out architectures with complete semantic fidelity so you and your AI companions can execute complex cross-ecosystem refactors with zero hallucinations.
            </p>
            
            <div className="bg-[#0a0a1a]/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,255,255,0.1)] text-left w-full max-w-3xl mx-auto mb-10">
              <div className="h-10 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400/80"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400/80"></div>
                </div>
                <div className="mx-auto text-xs text-gray-600 font-mono tracking-widest pl-6">AGENT_TERMINAL</div>
              </div>
              <div className="p-6 font-mono text-sm leading-relaxed text-gray-400">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-cyan-400 font-bold">$</span> 
                  <span className="text-white font-semibold">holoscript absorb workspace --strategy semantic</span>
                </div>
                <div className="text-gray-600 mb-1">[10:42:01] Ingesting <span className="text-gray-500">1,842 files</span> into AST memory...</div>
                <div className="text-gray-600 mb-1">[10:42:04] Computing semantic heuristics for 99 modules...</div>
                <div className="text-gray-600 mb-3">[10:42:09] Mapping <span className="text-gray-500">298K cross-ecosystem call edges</span>...</div>
                <div className="text-purple-400 font-bold mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                  Compressing knowledge graph...
                </div>
                <div className="text-green-400 mt-3 flex items-center gap-2">
                  <IconCheck /> <span className="text-green-300">Absorb complete. 68K symbols ready for multi-agent sync.</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/guides/codebase-intelligence" className="px-8 py-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold hover:bg-cyan-500/20 transition-all shadow-[0_0_20px_rgba(0,255,255,0.1)] inline-flex items-center gap-2">
                Discover Absorb <span className="text-lg">→</span>
              </a>
            </div>
          </div>
        </section>

        {/* Verticals */}
        <section className="py-24 bg-[#080812]/40 border-t border-white/5 w-full flex flex-col p-[12px] semantic-layout-priority">
          <div className="max-w-7xl mx-auto px-6 w-full z-10">
            <h2 className="text-4xl font-bold mb-16 text-center text-gray-900">Built for Every Creator</h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { t: 'Education', d: 'Virtual classrooms, interactive science labs, and historical recreations. Make learning immersive without technical barriers.' },
                { t: 'Autonomous Intelligence', d: '43+ MCP tools, swarm intelligence, economy primitives, and Brittney — a model that writes native HoloScript. Your agents think and evolve.' },
                { t: 'Gaming', d: 'Indie VR games, physics sandboxes, and interactive experiences. Rapid prototyping for game developers and hobbyists.' },
                { t: 'Web3 & Creator Economy', d: 'Auto-mint scenes as Zora Coins on Base. Token-gated experiences, NFT-linked objects, bonding curve pricing, and royalties.' },
                { t: 'Robotics', d: 'Compile scenes to URDF for ROS 2 robots or SDF for Gazebo simulation. Design environments in VR, then deploy to hardware.' },
                { t: 'IoT & Digital Twins', d: 'Export to DTDL for Azure Digital Twins and W3C WoT for IoT devices. Live sensor data visualization dashboards.' }
              ].map((v, i) => (
                <div key={i} className="p-6 bg-white/40 border border-black/10 rounded-xl shadow-md transition-colors">
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{v.t}</h3>
                  <p className="text-gray-800 font-medium">{v.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-16 bg-[#080812]/40 border-t border-white/5 w-full flex flex-col p-[12px] semantic-layout-priority">
          <div className="max-w-7xl mx-auto px-6 w-full z-10 text-center">
            <h2 className="text-4xl font-bold mb-4 text-gray-900">Ready to Build Your First VR World?</h2>
            <p className="text-xl text-gray-800 mb-10 font-medium">Join creators worldwide using HoloScript. Free and open-source.</p>
            <div>
              <a href="/guides/quick-start" className="inline-block px-10 py-4 rounded-lg bg-cyan-500 text-black font-bold text-lg hover:bg-cyan-400 hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,255,255,0.2)]">
                Start Building Now
              </a>
            </div>
            
            <div className="mt-16 flex flex-wrap justify-center gap-6 text-gray-800 font-bold mb-12">
              <a href="https://github.com/brianonbased-dev/HoloScript" className="hover:text-cyan-800 transition-colors">GitHub</a>
              <a href="/guides/" className="hover:text-cyan-800 transition-colors">Docs</a>
              <a href="/guides/quick-start" className="hover:text-cyan-800 transition-colors">Quick Start</a>
              <a href="/examples/" className="hover:text-cyan-800 transition-colors">Examples</a>
              <a href="https://studio.holoscript.net" className="hover:text-cyan-800 transition-colors">Studio</a>
              <a href="https://x.com/holoscript" className="hover:text-cyan-800 transition-colors">X / Twitter</a>
            </div>

            <div className="border-t border-black/10 pt-8 flex flex-col gap-2 text-gray-800 font-medium text-sm">
              <p>Made with <span className="text-green-600">💚</span> for the spatial computing community by <a href="https://x.com/OnBaseBrian" className="font-bold hover:text-cyan-800">Brian X Base LLC / @onbasebrian</a></p>
              <p>Released under the MIT License.</p>
              <p>Copyright © 2024-2026 Hololand</p>
            </div>
          </div>
        </footer>

      </div>
      {showMagicMoment && <MagicMomentWizard onClose={() => setShowMagicMoment(false)} />}
    </div>
  );
}
