'use client';

/**
 * HoloScript Studio -- Landing Page v2
 *
 * Zero-click law: ONE primary action per screen.
 * Flow: Hero -> Live code demo -> How it works -> Stats -> Get Started -> Targets -> Footer
 *
 * Removed: redundant AbsorbInput (competed with Get Started CTA), inline industry chips
 * (moved to wizard), secondary nav (already in layout).
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { OnboardingWizard } from '@/components/wizard/OnboardingWizard';

// -- Data -------------------------------------------------------------------

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
    @info_popup
    @label(text: "System Health")
    @gauge(value: 99.7, unit: "%")
    @texture(src: "panel.png")
    @realtime(interval: 5000)
    geometry: "plane"
    position: [0, 1.5, 0]
  }
}`;

const TARGET_OUTPUTS: Record<string, { label: string; snippet: string }> = {
  unity: {
    label: 'Unity C#',
    snippet: `public class StatusPanel : MonoBehaviour {
  [SerializeField] float mass = 1f;
  Rigidbody rb;
  void Start() {
    rb = gameObject.AddComponent<Rigidbody>();
    rb.mass = mass;
    // @grabbable -> XRGrabInteractable
    // @physics -> Rigidbody + BoxCollider
    // @realtime -> WebSocket polling
  }
}`,
  },
  urdf: {
    label: 'URDF (ROS 2)',
    snippet: `<robot name="StatusPanel">
  <link name="base_link">
    <inertial>
      <mass value="1.0"/>
      <origin xyz="0 1.5 0"/>
    </inertial>
    <visual>
      <geometry><box size="1.6 0.9 0.02"/></geometry>
    </visual>
    <collision>
      <geometry><box size="1.6 0.9 0.02"/></geometry>
    </collision>
  </link>
</robot>`,
  },
  r3f: {
    label: 'React Three Fiber',
    snippet: `export function StatusPanel() {
  return (
    <RigidBody mass={1}>
      <mesh position={[0, 1.5, 0]}>
        <planeGeometry args={[1.6, 0.9]} />
        <meshStandardMaterial
          map={useTexture("panel.png")}
        />
      </mesh>
      <InfoPopup text="System Health" />
      <GaugeOverlay value={99.7} unit="%" />
    </RigidBody>
  );
}`,
  },
  'native-2d': {
    label: 'Native 2D (HTML)',
    snippet: `<div class="status-panel">
  <img src="panel.png" alt="System Health" />
  <h3>System Health</h3>
  <div class="gauge" data-value="99.7">
    <span>99.7%</span>
  </div>
  <span class="status">Operational</span>
</div>`,
  },
};

const STEPS = [
  {
    number: '1',
    title: 'Describe or import',
    description: 'Paste a GitHub URL, upload data, or describe your business in plain language.',
  },
  {
    number: '2',
    title: 'AI builds your simulation',
    description: 'Absorb scans your code into a knowledge graph. Brittney generates compositions.',
  },
  {
    number: '3',
    title: 'Compile to any platform',
    description: 'One description becomes Unity, VisionOS, web, robotics, or 36 other targets.',
  },
] as const;

// -- Components -------------------------------------------------------------

function AuthBar() {
  const { data: session, status } = useSession();
  if (status === 'loading') return null;

  return (
    <div className="fixed top-0 right-0 p-4 z-50">
      {session ? (
        <div className="flex items-center gap-3">
          <Link href="/absorb" className="text-white/60 hover:text-white text-sm transition-colors">Dashboard</Link>
          <span className="text-white/30">|</span>
          <span className="text-white/50 text-sm">{session.user?.name || session.user?.email}</span>
          <button onClick={() => signOut()} className="text-white/40 hover:text-white/70 text-sm transition-colors">Sign out</button>
        </div>
      ) : (
        <button
          onClick={() => signIn('github')}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-white text-sm transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          Sign in with GitHub
        </button>
      )}
    </div>
  );
}

function CodeDemo() {
  const [target, setTarget] = useState<string>('r3f');
  const output = TARGET_OUTPUTS[target] || TARGET_OUTPUTS['r3f'];

  return (
    <section className="w-full max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Input */}
        <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
            <span className="text-white/50 text-xs font-mono">store.holo</span>
            <span className="text-emerald-400/60 text-xs">input</span>
          </div>
          <pre className="p-4 text-sm font-mono text-white/80 overflow-x-auto leading-relaxed">
            <code>{HOLO_EXAMPLE}</code>
          </pre>
        </div>

        {/* Output */}
        <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
            <div className="flex gap-1">
              {Object.entries(TARGET_OUTPUTS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setTarget(key)}
                  className={`px-2 py-0.5 rounded text-xs transition-all ${
                    target === key ? 'bg-blue-500/20 text-blue-400' : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
            <span className="text-blue-400/60 text-xs">output</span>
          </div>
          <pre className="p-4 text-sm font-mono text-white/80 overflow-x-auto leading-relaxed">
            <code>{output.snippet}</code>
          </pre>
        </div>
      </div>
      <p className="text-center text-white/30 text-xs mt-3">
        Same description. Different target. The compiler carries the platform knowledge.
      </p>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="w-full max-w-3xl mx-auto">
      <h2 className="text-center text-white/50 text-sm font-medium mb-8 uppercase tracking-wider">
        How it works
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {STEPS.map((step) => (
          <div key={step.number} className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 text-white/60 text-sm font-bold mb-3">
              {step.number}
            </div>
            <h3 className="text-white font-medium text-sm mb-1">{step.title}</h3>
            <p className="text-white/40 text-xs leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsStrip() {
  return (
    <div className="flex flex-wrap justify-center gap-8 text-sm">
      {[
        { value: '24', label: 'Compilers' },
        { value: '3,300+', label: 'Traits' },
        { value: '177', label: 'MCP Tools' },
        { value: '57,356', label: 'Tests' },
        { value: '40', label: 'Compile Targets' },
        { value: '6', label: 'Plugins' },
      ].map((s) => (
        <div key={s.label} className="text-center">
          <div className="text-white font-bold text-lg">{s.value}</div>
          <div className="text-white/30 text-xs">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function CompileTargetStrip() {
  return (
    <section className="w-full max-w-4xl mx-auto">
      <h2 className="text-center text-white/50 text-sm font-medium mb-4 uppercase tracking-wider">
        Compilation Targets
      </h2>
      <div className="flex flex-wrap justify-center gap-2">
        {COMPILE_TARGETS.map((t) => (
          <span
            key={t.name}
            className={`px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-xs ${t.color}`}
            title={t.category}
          >
            {t.name}
          </span>
        ))}
      </div>
    </section>
  );
}

// -- Main Page --------------------------------------------------------------

export default function HomePage() {
  const [showWizard, setShowWizard] = useState(false);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16 gap-16 bg-gradient-to-b from-[#0a0a1a] via-[#0d1117] to-[#0a0a1a]">
      <AuthBar />
      {showWizard && <OnboardingWizard onClose={() => setShowWizard(false)} />}

      {/* Hero */}
      <section className="text-center space-y-4 max-w-3xl pt-8">
        <h1 className="text-5xl font-bold text-white tracking-tight">
          HoloScript Studio
        </h1>
        <p className="text-xl text-white/60">
          One language. Every platform. Describe it, import it, or build from scratch.
        </p>
        {/* Primary CTA -- the ONE action on this page */}
        <div className="pt-4">
          <button onClick={() => setShowWizard(true)}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-medium text-lg transition-all shadow-lg shadow-blue-600/20">
            Get Started
          </button>
          <p className="text-white/30 text-sm mt-2">Free tier included. No credit card required.</p>
        </div>
      </section>

      {/* Live code demo -- the pitch */}
      <CodeDemo />

      {/* How it works -- replaces scattered noise */}
      <HowItWorks />

      {/* Stats -- real numbers */}
      <StatsStrip />

      {/* Compile targets */}
      <CompileTargetStrip />

      {/* Footer */}
      <footer className="text-white/20 text-xs">
        HoloScript v6 -- Open platform for spatial computing
      </footer>
    </main>
  );
}
