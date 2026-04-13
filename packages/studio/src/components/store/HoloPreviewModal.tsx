'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Layers, 
  Eye, 
  Play, 
  Pause,
  Download,
  ShieldCheck,
  Package,
  ShoppingCart
} from 'lucide-react';
import { MarketplaceItem } from '@/lib/marketplace/types';

interface HoloPreviewModalProps {
  item: MarketplaceItem;
  onClose: () => void;
  onInstall: (id: string) => void;
}

/**
 * HoloPreviewModal - Interactive 3D previewer for store assets.
 * Uses a canvas-based wireframe renderer for high-performance previewing.
 */
export function HoloPreviewModal({ item, onClose, onInstall }: HoloPreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoom, setZoom] = useState(1.2);
  const [lod, setLod] = useState(2); // 0-3 scale

  // Simplified projection logic for the preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId: number;
    let currentRot = rotation;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);
      
      // Draw background floor grid
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for(let i = -5; i <= 5; i++) {
        // Simple perspective lines
        ctx.beginPath();
        ctx.moveTo(cx + i * 20 * zoom, cy + 50 * zoom);
        ctx.lineTo(cx + i * 40 * zoom, cy + 150 * zoom);
        ctx.stroke();
      }

      // Logic to draw a generic wireframe based on item type
      // Real-world would parse item data, here we provide a high-quality stylized placeholder
      ctx.strokeStyle = item.verified ? '#2dd4bf' : '#3b82f6';
      ctx.lineWidth = 1.5;
      
      if (autoRotate) {
        currentRot += 0.01;
      }

      // Draw stylized wireframe object (Hexagon Prism)
      const sides = 6 + lod * 4;
      const radius = 60 * zoom;
      const height = 80 * zoom;
      
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2 + currentRot;
        const x = cx + Math.cos(angle) * radius;
        const yTop = cy - height/2 + Math.sin(angle * 2) * 5;
        const yBottom = cy + height/2 + Math.sin(angle * 2) * 5;
        
        if (i === 0) ctx.moveTo(x, yTop);
        else ctx.lineTo(x, yTop);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2 + currentRot;
        const x = cx + Math.cos(angle) * radius;
        const yBottom = cy + height/2 + Math.sin(angle * 2) * 5;
        
        if (i === 0) ctx.moveTo(x, yBottom);
        else ctx.lineTo(x, yBottom);
      }
      ctx.stroke();

      // Connect top and bottom
      for (let i = 0; i < sides; i+=2) {
        const angle = (i / sides) * Math.PI * 2 + currentRot;
        const x = cx + Math.cos(angle) * radius;
        const yTop = cy - height/2 + Math.sin(angle * 2) * 5;
        const yBottom = cy + height/2 + Math.sin(angle * 2) * 5;
        ctx.beginPath();
        ctx.moveTo(x, yTop);
        ctx.lineTo(x, yBottom);
        ctx.stroke();
      }

      frameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameId);
  }, [rotation, autoRotate, zoom, lod, item.verified]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 lg:p-12">
      <div className="relative w-full max-w-6xl h-full max-h-[800px] bg-studio-panel border border-studio-border rounded-3xl overflow-hidden flex flex-col lg:flex-row shadow-2xl">
        
        {/* Left: 3D Preview Canvas */}
        <div className="relative flex-1 bg-[#05050a] group">
          <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          
          <div className="absolute top-6 left-6 flex items-center gap-3">
             <div className="bg-studio-panel/80 backdrop-blur-md border border-studio-border rounded-xl px-4 py-2 flex items-center gap-3">
               <div className={`h-2 w-2 rounded-full ${item.verified ? 'bg-teal-400' : 'bg-studio-accent'} animate-pulse`} />
               <span className="text-xs font-mono uppercase tracking-widest text-white/70">Live Remote Preview</span>
             </div>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-studio-panel/80 backdrop-blur-md border border-studio-border rounded-2xl p-2 px-4 shadow-xl">
             <button onClick={() => setAutoRotate(!autoRotate)} className={`p-2 rounded-lg transition-colors ${autoRotate ? 'text-studio-accent bg-studio-accent/20' : 'text-studio-muted hover:text-white'}`}>
               {autoRotate ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
             </button>
             <div className="w-px h-4 bg-studio-border mx-2" />
             <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-2 rounded-lg text-studio-muted hover:text-white"><ZoomOut className="h-4 w-4" /></button>
             <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-2 rounded-lg text-studio-muted hover:text-white"><ZoomIn className="h-4 w-4" /></button>
             <button onClick={() => {setZoom(1.2); setRotation(0);}} className="p-2 rounded-lg text-studio-muted hover:text-white"><RotateCcw className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Right: Info & Meta */}
        <div className="w-full lg:w-[400px] border-l border-studio-border p-8 flex flex-col h-full bg-[#0d0d1a]">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-2 px-2 py-0.5 rounded-md bg-studio-accent/20 text-studio-accent text-[10px] font-bold uppercase tracking-wider">
               <Package className="h-3 w-3" />
               {item.type}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl border border-studio-border text-studio-muted hover:text-white hover:bg-white/5 transition-all">
              <X className="h-5 w-5" />
            </button>
          </div>

          <h2 className="text-3xl font-black text-white mb-2">{item.name}</h2>
          <div className="flex items-center gap-2 text-studio-muted mb-8">
            <div className="h-5 w-5 rounded-full bg-studio-accent/20 border border-studio-border" />
            <span className="text-sm">{item.author.name}</span>
            {item.verified && (
              <div className="flex items-center gap-1 text-teal-400 text-xs ml-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-2 mb-8">
             <p className="text-studio-muted leading-relaxed text-sm mb-8">
               {item.description}
             </p>

             <div className="space-y-4">
                <div className="flex flex-col gap-2">
                   <div className="flex justify-between text-[10px] text-studio-muted uppercase tracking-widest font-bold">
                      <span>Preview Detail (LOD)</span>
                      <span>{['Low', 'Medium', 'High', 'Ultra'][lod]}</span>
                   </div>
                   <input 
                      type="range" 
                      min="0" max="3" step="1" 
                      value={lod} 
                      onChange={(e) => setLod(parseInt(e.target.value))}
                      className="w-full accent-studio-accent"
                   />
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                      <div className="text-[10px] text-studio-muted uppercase mb-1">Polygons</div>
                      <div className="text-xl font-bold text-white">{(lod + 1) * 2.4}k</div>
                   </div>
                   <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                      <div className="text-[10px] text-studio-muted uppercase mb-1">Storage</div>
                      <div className="text-xl font-bold text-white">14.2mb</div>
                   </div>
                </div>
             </div>
          </div>

          <button 
            onClick={async () => {
              if (item.priceSats && item.priceSats > 0) {
                // Simulate x402 payment flow intercept
                const btn = document.getElementById('install-btn-text');
                if (btn) btn.innerText = 'Processing Payment (x402)...';
                await new Promise(r => setTimeout(r, 1500));
              }
              onInstall(item.id)
            }}
            className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-xl active:scale-[0.98] text-white hover:opacity-90"
            style={{ backgroundColor: item.priceSats && item.priceSats > 0 ? '#2563eb' : '#6366f1' }}
          >
            {item.priceSats && item.priceSats > 0 ? <ShoppingCart className="h-5 w-5" /> : <Download className="h-5 w-5" />}
            <span id="install-btn-text">
              {item.priceSats && item.priceSats > 0 
                ? `Buy for ${item.priceSats.toLocaleString()} SATS` 
                : 'Install to Workspace'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
