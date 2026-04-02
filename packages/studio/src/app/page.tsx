'use client';

/**
 * HoloScript Studio — Landing Page
 *
 * Shows what HoloScript IS before asking what you want to do with it.
 * Live code example → compile target demo → Absorb input → Get Started.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import { OnboardingWizard } from '@/components/wizard/OnboardingWizard';

// ── Data ────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/absorb', label: 'Absorb', icon: '📊' },
  { href: '/create', label: 'Editor', icon: '🔨' },
  { href: '/templates', label: 'Templates', icon: '📐' },
  { href: '/holomesh', label: 'HoloMesh', icon: '🌐' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
] as const;

const INDUSTRY_CHIPS = [
  { id: 'retail', label: 'Retail', emoji: '🏪' },
  { id: 'healthcare', label: 'Healthcare', emoji: '🏥' },
  { id: 'robotics', label: 'Robotics', emoji: '🤖' },
  { id: 'architecture', label: 'Architecture', emoji: '🏗️' },
  { id: 'agriculture', label: 'Agriculture', emoji: '🌾' },
  { id: 'education', label: 'Education', emoji: '🎓' },
  { id: 'manufacturing', label: 'Manufacturing', emoji: '🏭' },
  { id: 'automotive', label: 'Automotive', emoji: '🚗' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
] as const;

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

const HOLO_EXAMPLE = `composition "Store" {
  theme {
    primary: "#2d5016"
    accent: "#7cb342"
  }

  object "Product" {
    @grabbable
    @physics(mass: 2)
    @info_popup
    @label(text: "Blue Dream")
    @gauge(value: 21.5, unit: "%")
    @texture(src: "product.jpg")
    @credit(price: 45)
    geometry: "box"
    position: [0, 1, 0]
  }
}`;

const TARGET_OUTPUTS: Record<string, { label: string; snippet: string }> = {
  unity: {
    label: 'Unity C#',
    snippet: `public class Product : MonoBehaviour {
  [SerializeField] float mass = 2f;
  Rigidbody rb;
  void Start() {
    rb = gameObject.AddComponent<Rigidbody>();
    rb.mass = mass;
    // @grabbable → XRGrabInteractable
    // @physics → Rigidbody + BoxCollider
    // @info_popup → UI Canvas overlay
  }
}`,
  },
  urdf: {
    label: 'URDF (ROS 2)',
    snippet: `<robot name="Product">
  <link name="base_link">
    <inertial>
      <mass value="2.0"/>
      <origin xyz="0 1 0"/>
    </inertial>
    <visual>
      <geometry><box size="1 1 1"/></geometry>
    </visual>
    <collision>
      <geometry><box size="1 1 1"/></geometry>
    </collision>
  </link>
</robot>`,
  },
  r3f: {
    label: 'React Three Fiber',
    snippet: `export function Product() {
  return (
    <RigidBody mass={2}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry />
        <meshStandardMaterial
          map={useTexture("product.jpg")}
        />
      </mesh>
      <InfoPopup text="Blue Dream" />
      <GaugeOverlay value={21.5} unit="%" />
    </RigidBody>
  );
}`,
  },
  'native-2d': {
    label: 'Native 2D (HTML)',
    snippet: `<div class="product-card">
  <img src="product.jpg" alt="Blue Dream" />
  <h3>Blue Dream</h3>
  <div class="gauge" data-value="21.5">
    <span>21.5%</span>
  </div>
  <span class="price">$45</span>
  <button class="buy-btn">Add to Cart</button>
</div>`,
  },
};

// ── Components ──────────────────────────────────────────────────────────────

function AuthBar() {
  const { data: session, status } = useSession();
  if (status === 'loading') return null;

  return (
    <div className="fixed top-0 right-0 p-4 z-50">
      {session ? (
        <div className="flex items-center gap-3">
          <Link href="/absorb" className="text-white/60 hover:text-white text-sm transition-colors">Dashboard</Link>
          <span className="text-white/30">·</span>
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
      <h2 className="text-center text-white/50 text-sm font-medium mb-4 uppercase tracking-wider">
        Write once. Compile everywhere.
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Input */}
        <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/3">
            <span className="text-white/50 text-xs font-mono">store.holo</span>
            <span className="text-emerald-400/60 text-xs">input</span>
          </div>
          <pre className="p-4 text-sm font-mono text-white/80 overflow-x-auto leading-relaxed">
            <code>{HOLO_EXAMPLE}</code>
          </pre>
        </div>

        {/* Output */}
        <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/3">
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
        Same 15 lines. Different target. The compiler carries the platform knowledge.
      </p>
    </section>
  );
}

function StatsStrip() {
  return (
    <div className="flex flex-wrap justify-center gap-8 text-sm">
      {[
        { value: '37', label: 'Compilers' },
        { value: '3,300+', label: 'Traits' },
        { value: '177', label: 'MCP Tools' },
        { value: '57,356', label: 'Tests' },
        { value: '116', label: 'Categories' },
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
            className={`px-3 py-1.5 rounded-lg border border-white/5 bg-white/3 text-xs ${t.color}`}
            title={t.category}
          >
            {t.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function AbsorbInput() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'url' | 'csv' | 'describe'>('url');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    if (mode === 'url') router.push(`/absorb?repo=${encodeURIComponent(input.trim())}`);
    else if (mode === 'csv') router.push(`/absorb?csv=1`);
    else router.push(`/absorb?describe=${encodeURIComponent(input.trim())}`);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex gap-1 mb-3">
        {(['url', 'csv', 'describe'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-white/10 text-white border border-white/20' : 'text-white/50 hover:text-white/70'}`}>
            {m === 'url' ? '🔗 GitHub URL' : m === 'csv' ? '📊 CSV / Data' : '💬 Describe'}
          </button>
        ))}
      </div>
      <div className="relative">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'url' ? 'https://github.com/your-org/your-repo' : mode === 'csv' ? 'Paste CSV headers or upload a file...' : 'I run a dispensary with 200 SKUs and 3 locations...'}
          className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-lg focus:outline-none focus:border-blue-500/50 transition-all" />
        <button type="submit" disabled={loading || !input.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-lg text-white font-medium transition-all">
          {loading ? '...' : 'Absorb'}
        </button>
      </div>
      <p className="mt-2 text-white/30 text-sm text-center">
        {mode === 'url' && 'Scans your codebase into a knowledge graph. Free tier: 1 repo.'}
        {mode === 'csv' && 'Maps your data fields to HoloScript traits. Generates a spatial experience.'}
        {mode === 'describe' && 'Brittney builds your business simulation from a description.'}
      </p>
    </form>
  );
}

function IndustryRow() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {INDUSTRY_CHIPS.map((ind) => (
        <Link key={ind.id} href={`/industry/${ind.id}`}
          className="px-3 py-1.5 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 text-sm transition-all">
          {ind.emoji} {ind.label}
        </Link>
      ))}
    </div>
  );
}

function SecondaryNav() {
  return (
    <nav className="flex flex-wrap justify-center gap-4 text-sm">
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white/40 hover:text-white/80 transition-colors">
          <span>{item.icon}</span><span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

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
          One language. Every platform. Point it at your data or start from scratch.
        </p>
      </section>

      {/* Live code demo — the pitch */}
      <CodeDemo />

      {/* Stats — real numbers */}
      <StatsStrip />

      {/* Get Started */}
      <section className="flex flex-col items-center gap-4">
        <button onClick={() => setShowWizard(true)}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-medium text-lg transition-all shadow-lg shadow-blue-600/20">
          Get Started
        </button>
        <p className="text-white/30 text-sm">Import code, start from scratch, or describe your business</p>
      </section>

      {/* Quick absorb */}
      <AbsorbInput />

      {/* Compile targets */}
      <CompileTargetStrip />

      {/* Industries */}
      <section className="text-center space-y-3">
        <p className="text-white/30 text-sm">Works for any domain</p>
        <IndustryRow />
      </section>

      {/* Nav */}
      <SecondaryNav />

      {/* Footer */}
      <footer className="text-white/20 text-xs">
        HoloScript v6.0.1 · Open platform for spatial computing
      </footer>
    </main>
  );
}
