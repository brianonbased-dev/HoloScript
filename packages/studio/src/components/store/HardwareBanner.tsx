'use client';

import { Monitor, Download, ArrowRight, ShieldCheck, Zap, Globe } from 'lucide-react';

export function HardwareBanner() {
  const downloadSetup = () => {
    window.location.href = '/api/registry/download/setup'; // Proxy to the ps1 script
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-20">
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-studio-surface to-[#0d0d1a] border border-studio-border p-8 lg:p-12">
        {/* Visual Decoration */}
        <div className="absolute top-0 right-0 w-1/3 h-full opacity-20 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 400 400" fill="none">
            <path d="M400 0L0 400H400V0Z" fill="url(#grad1)" />
            <defs>
              <linearGradient id="grad1" x1="400" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
                <stop stopColor="#3b82f6" />
                <stop offset="1" stopColor="transparent" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-2 text-teal-400 font-mono text-xs uppercase tracking-widest mb-4">
              <Monitor className="h-4 w-4" />
              Native Hardware Layer
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight">
              Transform your PC into a <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">HoloScript Appliance.</span>
            </h2>
            <p className="text-studio-muted mb-8 leading-relaxed">
              Don't just run apps—become the infrastructure. Our replication script configures 
              your local GPU, installs the HoloMesh daemon, and registers your node as an 
              agentic powerhouse in the global network.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {[
                { icon: Zap, text: 'Auto-GPU config' },
                { icon: ShieldCheck, text: 'PQC Hardened' },
                { icon: Globe, text: 'HoloMesh Native' },
                { icon: ArrowRight, text: '30-min setup' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-studio-text">
                  <item.icon className="h-4 w-4 text-teal-400" />
                  {item.text}
                </div>
              ))}
            </div>

            <button 
              onClick={downloadSetup}
              className="group flex items-center gap-3 bg-white text-black px-8 py-4 rounded-2xl font-bold text-base hover:bg-teal-50 shadow-xl shadow-teal-500/10 transition-all active:scale-95"
            >
              <Download className="h-5 w-5 transition-transform group-hover:-translate-y-1" />
              Download setup.ps1
            </button>
          </div>

          <div className="hidden lg:block">
            <div className="relative rounded-2xl border border-white/5 bg-[#05050a] p-6 font-mono text-xs text-white/70 overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="ml-2 text-[10px] text-white/30">holoscript-setup.ps1</span>
              </div>
              <div className="space-y-1 opacity-80">
                <p className="text-studio-accent"># 1. Initializing Environment...</p>
                <p>Checking for Git, Node, pnpm...</p>
                <p className="text-teal-400"># 2. Detecting GPU Clusters...</p>
                <p>Found RTX 3060. CUDA 12.1 enabled.</p>
                <p className="text-purple-400"># 3. Synchronizing HoloMesh Identity...</p>
                <p>Generated Node Key: HS_0x8f4...2b9a</p>
                <p className="text-emerald-400"># 4. Finalizing Appliance State...</p>
                <p>Registry URL: https://store.holoscript.net</p>
                <div className="flex items-center gap-2 mt-4 text-studio-text">
                  <span className="animate-pulse">_</span>
                  <span>Appliance Ready.</span>
                </div>
              </div>
              
              {/* Glass Reflection */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
