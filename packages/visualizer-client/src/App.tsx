import { useState } from 'react';
import { Scene } from './components/Scene';
import { TimeControls } from './components/TimeControls';
import { useHoloSocket } from './hooks/useHoloSocket';
import './App.css';

function App() {
  const { orbs, status, timeState, sendTimeControl } = useHoloSocket(8080);
  const [selectedOrbId, setSelectedOrbId] = useState<string | null>(null);

  const selectedOrb = orbs.find((o) => o.id === selectedOrbId);

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      {/* Connection Status */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '10px 15px',
          borderRadius: '8px',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: '14px',
          borderLeft: '4px solid #00ffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background:
                status === 'connected'
                  ? '#00ff00'
                  : status === 'connecting'
                    ? '#ffaa00'
                    : '#ff0000',
              boxShadow: status === 'connected' ? '0 0 10px #00ff00' : 'none',
            }}
          />
          <span style={{ fontWeight: 'bold', letterSpacing: '1px' }}>
            {status === 'connected'
              ? 'SYSTEM ONLINE'
              : status === 'connecting'
                ? 'SYNCING...'
                : status === 'error'
                  ? 'CORE ERROR'
                  : 'OFFLINE'}
          </span>
        </div>
        <div style={{ marginTop: '5px', fontSize: '11px', color: '#00ffff', opacity: 0.8 }}>
          ACTIVE_ORBS: {orbs.length}
        </div>
      </div>

      {/* Details HUD */}
      {selectedOrb && (
        <div
          className="details-hud"
          style={{
            position: 'absolute',
            top: 100,
            left: 20,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(5px)',
            padding: '20px',
            borderRadius: '12px',
            color: '#fff',
            fontFamily: 'monospace',
            border: '1px solid #00ffff',
            width: '280px',
            boxShadow: '0 0 20px rgba(0, 255, 255, 0.2)',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px 0',
              color: '#00ffff',
              fontSize: '20px',
              borderBottom: '1px solid #00ffff',
              paddingBottom: '5px',
            }}
          >
            {selectedOrb.name}
          </h2>
          <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#aaa' }}>DISTANCE:</span>
              <span>
                {Math.sqrt(
                  selectedOrb.position.x ** 2 +
                    selectedOrb.position.y ** 2 +
                    selectedOrb.position.z ** 2
                ).toFixed(2)}{' '}
                units
              </span>
            </div>
            {selectedOrb.properties?.semiMajorAxis && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#aaa' }}>SMA:</span>
                  <span>{selectedOrb.properties.semiMajorAxis.toFixed(4)} AU</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#aaa' }}>ECC:</span>
                  <span>{selectedOrb.properties.eccentricity.toFixed(4)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#aaa' }}>PERIOD:</span>
                  <span>{selectedOrb.properties.orbitalPeriod.toFixed(1)} days</span>
                </div>
              </>
            )}
            <div
              style={{
                marginTop: '10px',
                borderTop: '1px solid rgba(0, 255, 255, 0.3)',
                paddingTop: '10px',
              }}
            >
              <span style={{ color: '#00ffff', display: 'block', marginBottom: '5px' }}>
                POSITION_VECTOR:
              </span>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '4px' }}>
                X: {selectedOrb.position.x.toFixed(4)}
                <br />
                Y: {selectedOrb.position.y.toFixed(4)}
                <br />
                Z: {selectedOrb.position.z.toFixed(4)}
              </div>
            </div>
          </div>
          <button
            onClick={() => setSelectedOrbId(null)}
            style={{
              marginTop: '15px',
              width: '100%',
              background: 'transparent',
              border: '1px solid #ff0055',
              color: '#ff0055',
              padding: '5px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            DISMISS_FOCUS
          </button>
        </div>
      )}

      {/* HoloScript Branding */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 1000,
          fontFamily: 'monospace',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#00ffff',
          textShadow: '0 0 10px #00ffff',
          pointerEvents: 'none',
        }}
      >
        HoloScript Visualizer
      </div>

      {/* 3D Scene */}
      <Scene
        orbs={orbs}
        selectedOrbId={selectedOrbId}
        onSelectOrb={setSelectedOrbId}
        timeScale={timeState?.timeScale || 1}
        julianDate={timeState?.julianDate || 0}
      />

      {/* Time Controls */}
      {timeState && (
        <TimeControls
          onTimeControl={sendTimeControl}
          currentTime={new Date(timeState.date)}
          timeScale={timeState.timeScale}
          isPaused={timeState.isPaused}
        />
      )}
    </div>
  );
}

export default App;
