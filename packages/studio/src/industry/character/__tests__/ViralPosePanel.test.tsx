// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ViralPosePanel } from '../animation/ViralPosePanel';

describe('ViralPosePanel', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ViralPosePanel
        currentPose={null}
        poseSequence={[]}
        isPlaying={false}
        onStart={() => {}}
        onStop={() => {}}
        onTriggerPose={() => {}}
        onTriggerNext={() => {}}
        onTriggerPrevious={() => {}}
      />
    );
    expect(container).toBeTruthy();
  });
});
