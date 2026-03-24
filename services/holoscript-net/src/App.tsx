import React, { useState } from 'react';
import { motion } from 'framer-motion';

export const App = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#050510',
      backgroundImage: 'radial-gradient(circle at 50% 50%, #1a1a3a 0%, #050510 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      perspective: '1200px'
    }}>
      
      {/* 3D Background Grid */}
      <div style={{
        position: 'absolute',
        inset: '-50%',
        backgroundImage: 'linear-gradient(rgba(0, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.05) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
        transform: 'rotateX(60deg) translateY(-100px) translateZ(-200px)',
        transformOrigin: 'top center',
        pointerEvents: 'none'
      }} />

      {/* Main Holographic Interactive Window */}
      <motion.div
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        animate={{
          rotateX: hovered ? 0 : 10,
          rotateY: hovered ? 0 : -10,
          y: hovered ? -10 : 0,
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{
          width: '800px',
          height: '500px',
          background: 'rgba(10, 20, 40, 0.6)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '24px',
          boxShadow: hovered 
            ? '0 0 80px rgba(0, 255, 255, 0.2), inset 0 0 30px rgba(0, 255, 255, 0.1)'
            : '0 20px 50px rgba(0,0,0,0.5)',
          padding: '60px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          zIndex: 10,
          transformStyle: 'preserve-3d'
        }}
      >
        {/* Holographic scanline sweep animation */}
        <motion.div
          animate={{ top: ['-20%', '120%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.8), transparent)',
            boxShadow: '0 0 15px rgba(0, 255, 255, 0.6)',
            zIndex: 20,
            pointerEvents: 'none'
          }}
        />

        {/* Floating Content Layer (Pushed forward in 3D space) */}
        <div style={{ transform: 'translateZ(60px)', zIndex: 30, display: 'flex', flexDirection: 'column', flex: 1 }}>
            
            <h1 style={{ 
              fontSize: '3.5rem', 
              color: '#fff', 
              margin: '0 0 1rem 0',
              fontWeight: 900,
              letterSpacing: '-1px',
              textShadow: '0 0 30px rgba(0, 255, 255, 0.6)'
            }}>
              Holographic Web
            </h1>
            
            <div style={{
              width: '80px',
              height: '4px',
              background: '#0ff',
              marginBottom: '2rem',
              boxShadow: '0 0 15px #0ff'
            }} />
            
            <p style={{
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '1.3rem',
              lineHeight: 1.7,
              maxWidth: '600px',
              fontWeight: 400
            }}>
              Transforming legacy 2D interfaces into inventive, spatial experiences. 
              The depth is simulated, the glow is native, and the payload is lightning-fast. 
              An immersive UI aesthetic—no VR headset required.
            </p>

            {/* Glowing Action Button */}
            <motion.button 
              whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(0, 255, 255, 0.6)', backgroundColor: 'rgba(0, 255, 255, 0.1)' }}
              whileTap={{ scale: 0.95 }}
              style={{
                marginTop: 'auto',
                alignSelf: 'flex-start',
                padding: '16px 40px',
                background: 'transparent',
                border: '2px solid #0ff',
                color: '#0ff',
                fontSize: '1.1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                fontWeight: 600,
                transition: 'background-color 0.2s ease'
              }}
            >
              Initialize Core
            </motion.button>
        </div>
      </motion.div>
    </div>
  );
};
