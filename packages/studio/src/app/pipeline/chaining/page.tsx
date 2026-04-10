'use client';

import React from 'react';
import { TaskChainingVisualizer } from '@/components/pipeline/TaskChainingVisualizer';

export default function TaskChainingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Task Chaining Studio</h1>
          <p className="text-zinc-400">
            Choreograph multi-agent workflows visually. Connect output state from one task into the parameters of the next.
          </p>
        </div>
        
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative flex">
          {/* Main Visualizer Surface */}
          <div className="flex-1 overflow-hidden relative">
            <TaskChainingVisualizer />
          </div>
        </div>
      </div>
    </div>
  );
}
