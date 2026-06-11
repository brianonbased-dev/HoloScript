'use client';

/**
 * HoloScript Studio — Prompt-First Landing (Lane A1)
 *
 * CADAM-style hero: describe → Brittney scaffolds → compile to any platform.
 * Intent chips (World / Part / App) set the creation mode.
 * Auth-gated on first SEND, not on view — matching /start behavior.
 *
 * Removed: marketing wall, redundant OnboardingWizard hero bloat.
 * Preserved: doc links in footer, compile targets strip, code demo.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { Send, Globe, Box, Code2, ArrowRight, Loader2 } from 'lucide-react';

// ── Lazy-loaded heavy components ─────────────────────────────────────────────

const ParametricPartDemo = dynamic(
  () =>
    import('@/components/landing/ParametricPartDemo').then((m) => ({
      default: m.ParametricPartDemo,
    })),
  { ssr: false, loading: () => <PartDemoSkeleton /> }
);

// ── Types ─────────────────────────────────────────────────────────────────────

type CreationMode = 'world' | 'part' | 'app';

interface IntentChip {
  mode: CreationMode;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const INTENT_CHIPS: IntentChip[] = [
  {
    mode: 'world',
    label: 'World',
    icon: <Globe className="h-4 w-4" />,
    placeholder: 'Describe a world, scene, or simulation...',
  },
  {
    mode: 'part',
    label: 'Part',
    icon: <Box className="h-4 w-4" />,
    placeholder: 'Describe a parametric 3D part to manufacture...',
  },
  {
    mode: 'app',
    label: 'App',
    icon: <Code2 className="h-4 w-4" />,
    placeholder: 'Describe an app, service, or digital twin...',
  },
];

const COMPILE_TARGETS = [
  { name: 'Unity', category: 'Game Engine', color: 'text-green-400' },
  { name: 'Unreal', category: 'Game Engine', color: 'text-blue-400' },
  { name: 'Godot', category: 'Game Engine', color: 'text-cyan-400' },
  { name: 'React Three Fiber', category: 'Web 3D', color: 'text-purple-400' },
  { name: 'VisionOS', category: 'XR', color: 'text-white' },
  { name: 'OpenXR', category: 'XR', color: 'text-orange-400' },
  { name: 'Quest / Android XR', category: 'XR', color: 'text-emerald-400' },
  { name: 'URDF (ROS 2)', category: 'Robotics', color: 'text-red-400' },
  { name: 'SDF (Gazebo)', category: 'Robotics', color: 'text-amber-400' },
  { name: 'DTDL (Azure IoT)', category: 'Digital Twin', color: 'text-sky-400' },
  { name: 'USD / USDZ', category: 'Film / AR', color: 'text-yellow-400' },
  { name: 'Node.js Service', category: 'Backend', color: 'text-lime-400' },
  { name: 'Native 2D (HTML)', category: 'Mobile / Web', color: 'text-pink-400' },
  { name: 'Phone Sleeve VR', category: 'VR', color: 'text-violet-400' },
  { name: 'NIR (Neuromorphic)', category: 'Neural', color: 'text-fuchsia-400' },
  { name: 'WebGPU / WASM', category: 'GPU', color: 'text-teal-400' },
] as const;

const HOLO_EXAMPLE = `composition "Dashboard" {
  theme {
    primary: "#1e3a5f"
    accent: "#3b82f6"
  }
  object "StatusPanel" {
    @grabbable
    @physics(mass: 1)
    @gauge(value: 99.7, unit: "%")
    @realtime(interval: 5000)
    geometry: "plane"
    position: [0, 1.5, 0]
  }
}`;

const TARGET_OUTPUTS: Record<string, { label: string; snippet: string }> = {
  r3f: {
    label: 'React Three Fiber',
    snippet: `export function StatusPanel() {
  return (
    <RigidBody mass={1}>
      <mesh position={[0, 1.5, 0]}>
        <planeGeometry args={[1.6, 0.9]} />
        <meshStandardMaterial />
      </mesh>
      <GaugeOverlay value={99.7} unit="%" />
    </RigidBody>
  );
}`,
  },
  unity: {
    label: 'Unity C#',
    snippet: `public class StatusPanel : MonoBehaviour {
  [SerializeField] float mass = 1f;
  void Start() {
    var rb = gameObject.AddComponent<Rigidbody>();
    rb.mass = mass;
    // @realtime -> WebSocket polling
  }
}`,
  },
  urdf: {
    label: 'URDF (ROS 2)',
    snippet: `<robot name="StatusPanel">
  <link name="base_link">
    <inertial><mass value="1.0"/></inertial>
    <visual>
      <geometry>
        <box size="1.6 0.9 0.02"/>
      </geometry>
    </visual>
  </link>
</robot>`,
  },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PartDemoSkeleton() {
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#0d0f1a] h-64 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-white/30 animate-spin" />
    </div>
  );
}

// ── Prompt hero ───────────────────────────────────────────────────────────────

function PromptHero() {
  const router = useRouter();
  const { status } = useSession();
  const [mode, setMode] = useState<CreationMode>('world');
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeChip = INTENT_CHIPS.find((c) => c.mode === mode) ?? INTENT_CHIPS[0]!;

  const handleSend = useCallback(() => {
    const text = prompt.trim();
    if (!text) return;

    // Store prompt for the target page to pick up
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('studio.landing.prompt', text);
    }

    if (status !== 'authenticated') {
      // Auth-gate on first send: sign in, then redirect to create
      void signIn('github', {
        callbackUrl: `/create?mode=${mode}&prompt=${encodeURIComponent(text)}`,
      });
      return;
    }

    router.push(`/create?mode=${mode}`);
  }, [prompt, mode, status, router]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <section className="w-full max-w-2xl mx-auto space-y-4">
      {/* Title */}
      <div className="text-center space-y-2 pt-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
          HoloScript Studio
        </h1>
        <p className="text-lg text-white/50">
          Describe it. Build it. Compile to any platform.
        </p>
      </div>

      {/* Intent chips */}
      <div className="flex items-center justify-center gap-2">
        {INTENT_CHIPS.map((chip) => (
          <button
            key={chip.mode}
            onClick={() => {
              setMode(chip.mode);
              inputRef.current?.focus();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all border ${
              mode === chip.mode
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : 'text-white/40 border-white/10 hover:text-white/70 hover:border-white/20 bg-white/[0.02]'
            }`}
          >
            {chip.icon}
            {chip.label}
          </button>
        ))}
      </div>

      {/* Prompt input */}
      <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-lg shadow-black/30 transition-colors focus-within:border-indigo-500/30">
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKey}
          placeholder={activeChip.placeholder}
          rows={3}
          className="w-full resize-none bg-transparent px-4 py-3.5 pr-16 text-sm text-white placeholder-white/20 outline-none"
          aria-label="Describe what you want to build"
        />
        <button
          onClick={handleSend}
          disabled={!prompt.trim()}
          className="absolute bottom-3 right-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 p-2.5 text-white transition-all shadow disabled:opacity-20 disabled:hover:bg-indigo-600"
          aria-label="Send prompt"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Sub-CTA row */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link
          href="/start"
          className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors"
        >
          Chat with Brittney
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <span className="text-white/10">·</span>
        <Link
          href="/playground"
          className="text-white/40 hover:text-white/70 transition-colors"
        >
          Playground (no sign-in)
        </Link>
        <span className="text-white/10">·</span>
        <Link
          href="/absorb"
          className="text-white/40 hover:text-white/70 transition-colors"
        >
          Import repo
        </Link>
      </div>
    </section>
  );
}

// ── Recent projects (signed-in users only) ────────────────────────────────────

interface ProjectStub {
  id: string;
  name: string;
  updatedAt: string;
}

function RecentProjects() {
  const { status } = useSession();
  const [projects, setProjects] = useState<ProjectStub[]>([]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { projects?: ProjectStub[] } | null) => {
        if (data?.projects) setProjects(data.projects.slice(0, 4));
      })
      .catch(() => {});
  }, [status]);

  if (projects.length === 0) return null;

  return (
    <section className="w-full max-w-2xl mx-auto">
      <p className="text-white/30 text-xs mb-2 uppercase tracking-wider">Recent projects</p>
      <div className="grid grid-cols-2 gap-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/create?projectId=${p.id}`}
            className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 hover:border-white/15 hover:bg-white/[0.04] transition-all"
          >
            <p className="text-white/80 text-sm truncate">{p.name}</p>
            <p className="text-white/30 text-xs mt-0.5">
              {new Date(p.updatedAt).toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Code demo ─────────────────────────────────────────────────────────────────

function CodeDemo() {
  const [target, setTarget] = useState<string>('r3f');
  const output = TARGET_OUTPUTS[target] ?? TARGET_OUTPUTS['r3f']!;

  return (
    <section className="w-full max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
            <span className="text-white/50 text-xs font-mono">store.holo</span>
            <span className="text-emerald-400/60 text-xs">input</span>
          </div>
          <pre className="p-4 text-xs font-mono text-white/70 overflow-x-auto leading-relaxed">
            <code>{HOLO_EXAMPLE}</code>
          </pre>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
            <div className="flex gap-1">
              {Object.entries(TARGET_OUTPUTS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setTarget(key)}
                  className={`px-2 py-0.5 rounded text-xs transition-all ${
                    target === key
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
            <span className="text-blue-400/60 text-xs">output</span>
          </div>
          <pre className="p-4 text-xs font-mono text-white/70 overflow-x-auto leading-relaxed">
            <code>{output.snippet}</code>
          </pre>
        </div>
      </div>
      <p className="text-center text-white/25 text-xs mt-3">
        Same description. Different target. The compiler carries the platform knowledge.
      </p>
    </section>
  );
}

// ── Compile targets ───────────────────────────────────────────────────────────

function CompileTargetStrip() {
  return (
    <section className="w-full max-w-4xl mx-auto">
      <h2 className="text-center text-white/40 text-xs font-medium mb-4 uppercase tracking-wider">
        Compilation Targets
      </h2>
      <div className="flex flex-wrap justify-center gap-2">
        {COMPILE_TARGETS.map((t) => (
          <span
            key={t.name}
            className={`px-2.5 py-1 rounded-lg border border-white/5 bg-white/[0.02] text-xs ${t.color}`}
            title={t.category}
          >
            {t.name}
          </span>
        ))}
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="w-full max-w-4xl mx-auto flex flex-wrap justify-center gap-x-6 gap-y-2 text-white/20 text-xs pb-8">
      <Link href="/docs" className="hover:text-white/40 transition-colors">
        Docs
      </Link>
      <Link href="/holomesh/discover" className="hover:text-white/40 transition-colors">
        HoloMesh
      </Link>
      <Link href="/registry" className="hover:text-white/40 transition-colors">
        Registry
      </Link>
      <Link href="/playground" className="hover:text-white/40 transition-colors">
        Playground
      </Link>
      <span>HoloScript — Open platform for spatial computing</span>
    </footer>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  // Mark as returning on first visit (used by /start to detect returning users)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('holoscript-returning-user', '1');
    }
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 gap-14 bg-gradient-to-b from-[#0a0a1a] via-[#0d1117] to-[#0a0a1a]">
      {/* Prompt hero with intent chips */}
      <PromptHero />

      {/* Recent projects (signed-in only) */}
      <RecentProjects />

      {/* CADAM-style parametric part demo */}
      <section className="w-full max-w-2xl mx-auto">
        <h2 className="text-center text-white/40 text-xs font-medium mb-4 uppercase tracking-wider">
          Live Manufacturing Demo
        </h2>
        <p className="text-center text-white/25 text-xs mb-4">
          Adjust sliders — mesh updates in real time via the manufacturing API.
        </p>
        <ParametricPartDemo />
      </section>

      {/* Live code demo */}
      <CodeDemo />

      {/* Compile targets */}
      <CompileTargetStrip />

      {/* Footer with doc links */}
      <Footer />
    </main>
  );
}
