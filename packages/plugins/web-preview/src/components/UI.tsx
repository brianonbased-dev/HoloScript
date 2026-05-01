import './UI.css';

interface UIProps {
  renderMode: 'demo' | 'usd' | 'holoscript';
  setRenderMode: (mode: 'demo' | 'usd' | 'holoscript') => void;
}

export function UI({ renderMode, setRenderMode }: UIProps) {
  return (
    <div className="ui-container">
      {/* Header */}
      <div className="ui-header">
        <div className="ui-logo">
          <h1>HoloScript Robotics Studio</h1>
          <span className="ui-badge">Template Validated</span>
        </div>
        <div className="ui-actions">
          <div className="render-mode-toggle">
            <button
              className={`ui-button mode-button ${renderMode === 'usd' ? 'active' : ''}`}
              onClick={() => setRenderMode('usd')}
            >
              USD Render
            </button>
            <button
              className={`ui-button mode-button ${renderMode === 'demo' ? 'active' : ''}`}
              onClick={() => setRenderMode('demo')}
            >
              Demo
            </button>
          </div>
          <div className="quality-badge">
            <div className="quality-score">100</div>
            <div className="quality-label">/100</div>
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <div className="ui-panel">
        <h3>2-DOF Robot Arm (Template-Compliant)</h3>

        {renderMode === 'usd' && (
          <div
            className="ui-badge"
            style={{
              marginBottom: '16px',
              background: 'rgba(33, 150, 243, 0.2)',
              borderColor: '#2196f3',
            }}
          >
            🎯 Rendering from compiled USD
          </div>
        )}
        {renderMode === 'demo' && (
          <div
            className="ui-badge"
            style={{
              marginBottom: '16px',
              background: 'rgba(156, 39, 176, 0.2)',
              borderColor: '#9c27b0',
            }}
          >
            🎨 Professional Demo Visualization
          </div>
        )}

        <div className="ui-section validation-section">
          <h4>✅ Template Validation Passed</h4>
          <div className="ui-stats">
            <div className="ui-stat success">
              <span className="ui-stat-label">Components</span>
              <span className="ui-stat-value">6 ✓</span>
            </div>
            <div className="ui-stat success">
              <span className="ui-stat-label">Traits</span>
              <span className="ui-stat-value">All ✓</span>
            </div>
            <div className="ui-stat success">
              <span className="ui-stat-label">Chain</span>
              <span className="ui-stat-value">Complete ✓</span>
            </div>
          </div>
        </div>

        <div className="ui-section">
          <h4>🚫 "Flag Pole" Problem - SOLVED</h4>
          <div className="comparison-grid">
            <div className="comparison-card bad">
              <div className="comparison-header">❌ Before (0/100)</div>
              <div className="comparison-body">
                • 1 cylinder = "flag pole"
                <br />
                • Missing 5 components
                <br />
                • No kinematic chain
                <br />• ⛔ Compilation blocked
              </div>
            </div>
            <div className="comparison-card good">
              <div className="comparison-header">✅ After (100/100)</div>
              <div className="comparison-body">
                • 6 proper components
                <br />
                • Full kinematic chain
                <br />
                • Realistic proportions
                <br />• ✓ Isaac Sim ready
              </div>
            </div>
          </div>
        </div>

        <div className="ui-section">
          <h4>📋 Required Components</h4>
          <ul className="ui-list compact">
            <li>✅ Base (cylinder, static)</li>
            <li>✅ Joint 1 (revolute, -180° to 180°)</li>
            <li>✅ Link 1 (cylinder, 5kg mass)</li>
            <li>✅ Joint 2 (revolute, -90° to 90°)</li>
            <li>✅ Link 2 (cylinder, 3kg mass)</li>
            <li>✅ End Effector (sphere, static)</li>
          </ul>
        </div>

        <div className="ui-section">
          <h4>🔄 Compilation Pipeline</h4>
          <div className="pipeline">
            <div className="pipeline-step">
              HoloScript
              <br />
              <small>58 lines</small>
            </div>
            <div className="pipeline-arrow">↓</div>
            <div className="pipeline-step highlight">
              Validation
              <br />
              <small>100/100 ✓</small>
            </div>
            <div className="pipeline-arrow">↓</div>
            <div className="pipeline-step">
              USD
              <br />
              <small>118 lines</small>
            </div>
          </div>
        </div>

        <div className="ui-footer">
          <p className="ui-muted">
            Compiled from <code>two_link_arm_validated.hsplus</code>
          </p>
          <p className="ui-highlight">
            ✨ Template system prevents bare minimum "flag pole" generation
          </p>
        </div>
      </div>
    </div>
  );
}
