import React from 'react';

// Auto-generated Native 2D HoloScript Component
export function HoloScriptLandingComponent() {
  const _navigate = (path: string) => {
    window.location.href = path;
  };
  const _submitNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Subscribed!');
  };

  return (
    <div className="holoscript-2d-root" style={{ width: '100%', height: '100%' }}>
      <div>
        <div className="landing-nav"></div>
      </div>
    </div>
  );
}

export default HoloScriptLandingComponent;
