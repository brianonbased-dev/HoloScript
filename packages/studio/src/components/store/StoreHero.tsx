'use client';

import { Search, Sparkles } from 'lucide-react';

interface StoreHeroProps {
  onSearch: (query: string) => void;
}

export function StoreHero({ onSearch }: StoreHeroProps) {
  return (
    <div className="relative overflow-hidden bg-[#05050a] py-16 px-6 lg:px-12">
      {/* Animated Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-studio-accent/20 blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-purple-500/10 blur-[100px] animate-pulse delay-700" />
        <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] bg-teal-500/10 blur-[80px] animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-studio-accent/10 border border-studio-accent/20 text-studio-accent text-[10px] font-bold tracking-widest uppercase mb-6 animate-fade-in">
          <Sparkles className="h-3 w-3" />
          The HoloScript Ecosystem
        </div>
        
        <h1 className="text-4xl lg:text-6xl font-black text-white tracking-tight mb-6 leading-tight">
          One Registry. <span className="text-transparent bg-clip-text bg-gradient-to-r from-studio-accent to-purple-400">Infinite Realms.</span>
        </h1>
        
        <p className="text-lg text-studio-muted mb-10 max-w-2xl mx-auto leading-relaxed">
          Welcome to the world's first AI-Native store. Discover high-fidelity scenes, 
          agentic workflows, and the scripts that turn any machine into HoloScript Hardware.
        </p>

        {/* Semantic Search Bar */}
        <div className="relative max-w-2xl mx-auto group">
          <div className="absolute inset-0 bg-studio-accent/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
          <div className="relative flex items-center bg-studio-panel/60 backdrop-blur-xl border border-studio-border/50 rounded-2xl p-1.5 shadow-2xl transition-all group-focus-within:border-studio-accent group-focus-within:ring-2 ring-studio-accent/20">
            <Search className="ml-4 h-5 w-5 text-studio-muted" />
            <input
              type="text"
              placeholder="Ask anything... 'Show me PQC-encrypted medieval assets'"
              className="flex-1 bg-transparent border-none outline-none py-3 px-4 text-white placeholder-studio-muted text-base"
              onChange={(e) => onSearch(e.target.value)}
            />
            <button className="bg-studio-accent text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-studio-accent/90 transition-all shadow-lg shadow-studio-accent/20 active:scale-95">
              Search
            </button>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['Character', 'PQC Assets', 'Multiplayer Template', 'AI Workflows'].map(tag => (
              <button 
                key={tag}
                onClick={() => onSearch(tag)}
                className="text-[10px] px-3 py-1 rounded-full bg-white/5 border border-white/10 text-studio-muted hover:text-white hover:bg-white/10 transition-all"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
