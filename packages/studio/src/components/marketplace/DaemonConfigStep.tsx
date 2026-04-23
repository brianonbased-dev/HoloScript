import React from 'react';
import { DaemonProfile } from '@holoscript/types';

interface DaemonConfigStepProps {
  enableDaemon: boolean;
  daemonProfile: DaemonProfile | null;
  onChangeEnableDaemon: (enabled: boolean) => void;
  onChangeDaemonProfile: (profile: DaemonProfile) => void;
}

export const DaemonConfigStep: React.FC<DaemonConfigStepProps> = ({
  enableDaemon,
  daemonProfile,
  onChangeEnableDaemon,
  onChangeDaemonProfile,
}) => {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="mb-4 text-base font-semibold text-studio-text">Daemon Configuration</h3>

        <div className="flex items-center gap-3 rounded-lg bg-studio-surface p-4 border border-studio-border">
          <input
            type="checkbox"
            id="enable-daemon"
            checked={enableDaemon}
            onChange={(e) => onChangeEnableDaemon(e.target.checked)}
            className="w-4 h-4 cursor-pointer"
          />
          <label htmlFor="enable-daemon" className="flex-1 font-medium text-studio-text cursor-pointer">
            Enable daemon analysis & optimization
          </label>
        </div>

        {enableDaemon && (
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="profile-select" className="block text-sm font-medium text-studio-text mb-3">
                Analysis Profile
              </label>
              <div className="space-y-3">
                {['quick', 'balanced', 'thorough'].map((profile) => (
                  <div
                    key={profile}
                    onClick={() => onChangeDaemonProfile(profile as DaemonProfile)}
                    className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
                      daemonProfile === profile
                        ? 'border-studio-accent bg-studio-accent/10'
                        : 'border-studio-border hover:border-studio-accent/50'
                    }`}
                  >
                    <div className="font-medium text-studio-text capitalize">{profile}</div>
                    <div className="mt-1 text-xs text-studio-text-muted">
                      {profile === 'quick' && 'Fast analysis (1-2 minutes)'}
                      {profile === 'balanced' && 'Recommended: Balance quality & speed (5-10 minutes)'}
                      {profile === 'thorough' && 'Deep analysis with extensive optimization (15-30 minutes)'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-studio-info/10 p-4 border border-studio-info/30">
              <div className="text-sm text-studio-text">
                🤖 The daemon will analyze your content for quality improvements, performance optimization, and compatibility checks.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
