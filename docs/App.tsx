import React from 'react';

// Auto-generated Native 2D HoloScript Component
export function implicitComponent() {
  const navigate = (path: string) => {
    window.location.href = path;
  };
  const submitNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Subscribed!');
  };

  return (
    <div className="holoscript-2d-root" style={{ width: '100%', height: '100%' }}>
      <div
        style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #1a1a3a 0%, #050510 100%)' }}
        className="min-h-[100vh] bg-[#050510] flex items-center justify-center overflow-hidden [perspective:1200px]"
      >
        <div
          style={{
            backgroundImage:
              'linear-gradient(rgba(0, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.05) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
            transform: 'rotateX(60deg) translateY(-100px) translateZ(-200px)',
          }}
          className="absolute inset-[-50%] pointer-events-none origin-top"
        ></div>
        <div
          style={{ backdropFilter: 'blur(20px)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
          className="w-[800px] h-[500px] bg-[rgba(10,20,40,0.6)] border border-[rgba(0,255,255,0.3)] rounded-3xl p-[60px] flex flex-col relative overflow-hidden z-10 [transform-style:preserve-3d]"
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `@keyframes sweep { from { top: -20% } to { top: 120% } }`,
            }}
          />
          <div
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.8), transparent)',
              boxShadow: '0 0 15px rgba(0, 255, 255, 0.6)',
              animation: 'sweep 4s linear infinite',
            }}
            className="absolute left-0 right-0 h-[2px] z-20 pointer-events-none"
          ></div>
          <div style={{ transform: 'translateZ(60px)' }} className="flex flex-col flex-1 z-30">
            <h1
              style={{ textShadow: '0 0 30px rgba(0, 255, 255, 0.6)' }}
              className="text-5xl font-bold tracking-tight text-[3.5rem] font-black text-white mb-4 tracking-tight"
            >
              Holographic Web
            </h1>
            <div
              style={{ boxShadow: '0 0 15px #0ff' }}
              className="w-[80px] h-[4px] bg-[#0ff] mb-8"
            ></div>
            <p className="text-[rgba(255,255,255,0.8)] text-[1.3rem] leading-[1.7] max-w-[600px] font-normal">
              Transforming legacy 2D interfaces into inventive, spatial experiences. The depth is
              simulated, the glow is native, and the payload is lightning-fast. An immersive UI
              aesthetic—no VR headset required.
            </p>
            <button
              style={{ boxShadow: '0 0 30px rgba(0, 255, 255, 0.4)' }}
              className="px-4 py-2 rounded-lg font-medium transition-all bg-indigo-600 text-white glow-btn hover:bg-indigo-500 px-6 py-3 text-lg mt-auto self-start px-[40px] py-[16px] bg-transparent border-2 border-[#0ff] text-[#0ff] text-[1.1rem] rounded-lg tracking-[2px] font-semibold uppercase transition hover:bg-[rgba(0,255,255,0.1)] hover:scale-105"
            >
              Initialize Core
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default implicitComponent;
