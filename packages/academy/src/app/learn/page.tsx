import React from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Clock, Award, Star } from 'lucide-react';
import { Button } from '@holoscript/ui';

export default function LearnPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="h-14 border-b border-slate-800 flex items-center px-4 bg-slate-900 shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="font-medium text-sm">Academy Home</span>
        </Link>
        <div className="mx-auto flex items-center gap-2 text-emerald-400">
          <BookOpen size={18} />
          <span className="font-semibold text-sm mr-24">Interactive Tutorials</span>
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm">
            Student Login
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-10 text-center">
            <h1 className="text-4xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              Master Spatial Computing
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Learn the foundations of HoloScript through interactive step-by-step challenges. Write
              code, see it render instantly in 3D, and earn badges.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Beginner */}
            <Link href="/learn/primitives-positioning" className="block outline-none">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-emerald-500/50 transition-colors group cursor-pointer h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                    <Star size={24} />
                  </div>
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                    Level 1
                  </span>
                </div>
                <h2 className="text-xl font-bold mb-2 group-hover:text-emerald-400 transition-colors">
                  Primitives & Positioning
                </h2>
                <p className="text-slate-400 text-sm mb-6">
                  Learn how to spawn basic shapes and move them in 3D space using coordinates.
                </p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock size={14} /> 15 mins
                  </div>
                  <div className="flex items-center gap-1">
                    <Award size={14} /> 1 Badge
                  </div>
                </div>
              </div>
            </Link>

            {/* Intermediate */}
            <Link href="/learn/materials-lighting" className="block outline-none">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-cyan-500/50 transition-colors group cursor-pointer h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400">
                    <BookOpen size={24} />
                  </div>
                  <span className="text-xs font-semibold text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded">
                    Level 2
                  </span>
                </div>
                <h2 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">
                  Materials & Lighting
                </h2>
                <p className="text-slate-400 text-sm mb-6">
                  Make your objects look realistic by applying textures, roughness, and dynamic
                  light sources.
                </p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock size={14} /> 25 mins
                  </div>
                  <div className="flex items-center gap-1">
                    <Award size={14} /> 1 Badge
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
