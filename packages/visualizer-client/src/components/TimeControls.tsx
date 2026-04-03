import React, { useState } from 'react';
import { formatDate, formatTime } from '../utils/format';

interface TimeControlsProps {
  onTimeControl: (command: string, value?: unknown) => void;
  currentTime: Date;
  timeScale: number;
  isPaused: boolean;
}

export const TimeControls: React.FC<TimeControlsProps> = ({
  onTimeControl,
  currentTime,
  timeScale,
  isPaused,
}) => {
  const [selectedSpeed, setSelectedSpeed] = useState(timeScale);

  const handleSpeedChange = (speed: number) => {
    setSelectedSpeed(speed);
    onTimeControl('setSpeed', speed);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '12px',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Time Display */}
      <div style={{ textAlign: 'center', minWidth: '140px' }}>
        <div
          style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#fff',
            marginBottom: '4px',
          }}
        >
          {formatDate(currentTime)}
        </div>
        <div style={{ fontSize: '12px', color: '#aaa' }}>{formatTime(currentTime)}</div>
      </div>

      {/* Divider */}
      <div
        style={{
          width: '1px',
          height: '40px',
          background: 'rgba(255, 255, 255, 0.2)',
        }}
      />

      {/* Play/Pause Button */}
      <button
        onClick={() => onTimeControl(isPaused ? 'play' : 'pause')}
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '8px',
          width: '48px',
          height: '48px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          transition: 'all 0.2s',
          color: '#fff',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {isPaused ? '▶' : '⏸'}
      </button>

      {/* Speed Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '12px', color: '#aaa', minWidth: '40px' }}>Speed:</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[1, 10, 100, 365.25, 1000, 10000].map((speed) => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              style={{
                background:
                  selectedSpeed === speed ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                border:
                  selectedSpeed === speed
                    ? '1px solid rgba(0, 255, 255, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: selectedSpeed === speed ? 'bold' : 'normal',
                color: '#fff',
                transition: 'all 0.2s',
              }}
            >
              {speed === 365.25 ? '1Y/24H' : speed >= 1000 ? `${speed / 1000}k` : speed}x
            </button>
          ))}
        </div>

        <div
          style={{
            width: '1px',
            height: '24px',
            background: 'rgba(255, 255, 255, 0.1)',
            margin: '0 5px',
          }}
        />

        <button
          onClick={() => {
            handleSpeedChange(1);
            onTimeControl('syncRealTime');
          }}
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '6px',
            padding: '8px 15px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#00ffff',
            fontWeight: 'bold',
            textShadow: '0 0 5px rgba(0, 255, 255, 0.5)',
            letterSpacing: '0.5px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          SYNC_NOW
        </button>
      </div>
    </div>
  );
};
