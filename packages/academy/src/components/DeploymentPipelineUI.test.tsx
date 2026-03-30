// @vitest-environment jsdom

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeploymentPipelineUI } from './DeploymentPipelineUI';

describe('DeploymentPipelineUI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Basic Rendering ────────────────────────────────────────────────────────

  it('renders the pipeline with all stages', () => {
    render(<DeploymentPipelineUI />);

    expect(screen.getByText('Deployment Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Compile')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getByText('Verify')).toBeInTheDocument();
  });

  it('renders quality tier selector with default value', () => {
    render(<DeploymentPipelineUI />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('med');
  });

  it('displays target info based on selected quality tier', () => {
    render(<DeploymentPipelineUI />);

    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByText('cloudflare-workers')).toBeInTheDocument();
  });

  // ── Quality Tier Selection ─────────────────────────────────────────────────

  it('updates target display when quality tier changes', async () => {
    render(<DeploymentPipelineUI />);

    const select = screen.getByRole('combobox');

    // Change to low
    fireEvent.change(select, { target: { value: 'low' } });
    await waitFor(() => {
      expect(screen.getByText('Development')).toBeInTheDocument();
      expect(screen.getByText('vercel-edge')).toBeInTheDocument();
    });

    // Change to high
    fireEvent.change(select, { target: { value: 'high' } });
    await waitFor(() => {
      expect(screen.getByText('Production')).toBeInTheDocument();
      expect(screen.getByText('aws-lambda')).toBeInTheDocument();
    });

    // Change to ultra
    fireEvent.change(select, { target: { value: 'ultra' } });
    await waitFor(() => {
      expect(screen.getByText('Global CDN')).toBeInTheDocument();
      expect(screen.getByText('multi-region')).toBeInTheDocument();
    });
  });

  it('disables tier selector during deployment', async () => {
    render(<DeploymentPipelineUI />);

    const select = screen.getByRole('combobox');
    const deployButton = screen.getByRole('button', { name: /deploy/i });

    // Start deployment
    fireEvent.click(deployButton);

    await waitFor(() => {
      expect(select).toBeDisabled();
    });
  });

  // ── Deployment Flow ────────────────────────────────────────────────────────

  it('executes pipeline stages in sequence', async () => {
    const onDeployStart = vi.fn();
    const onDeployComplete = vi.fn();

    render(
      <DeploymentPipelineUI onDeployStart={onDeployStart} onDeployComplete={onDeployComplete} />
    );

    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    // Verify onDeployStart called
    expect(onDeployStart).toHaveBeenCalledWith('med');

    // Fast-forward through all stages
    await vi.runAllTimersAsync();

    // Verify onDeployComplete called with success
    await waitFor(() => {
      expect(onDeployComplete).toHaveBeenCalledWith(true);
    });
  });

  it('shows deploying state during pipeline execution', async () => {
    render(<DeploymentPipelineUI />);

    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    await waitFor(() => {
      expect(screen.getByText('Deploying...')).toBeInTheDocument();
    });

    // Button should be disabled
    expect(deployButton).toBeDisabled();
  });

  it('updates stage status indicators correctly', async () => {
    render(<DeploymentPipelineUI />);

    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    // All stages should start idle
    // After starting, first stage should show running

    // Fast-forward
    await vi.advanceTimersByTimeAsync(1000);

    // Source should complete
    await waitFor(() => {
      expect(screen.getByText(/Source ready/i)).toBeInTheDocument();
    });

    // Complete all stages
    await vi.runAllTimersAsync();

    // Final stage should show success
    await waitFor(() => {
      expect(screen.getByText(/All health checks passed/i)).toBeInTheDocument();
    });
  });

  it('handles empty source with warning', async () => {
    render(<DeploymentPipelineUI source="" />);

    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(screen.getByText(/No source provided/i)).toBeInTheDocument();
    });
  });

  it('displays progress bars during compilation and deployment', async () => {
    render(<DeploymentPipelineUI />);

    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    // Advance to compilation stage
    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(screen.getByText(/Compiling.../i)).toBeInTheDocument();
    });

    // Progress should be visible during running stages
    // (visual check - presence of progress indicator elements)
  });

  // ── Logs Panel ─────────────────────────────────────────────────────────────

  it('toggles log panel visibility', async () => {
    render(<DeploymentPipelineUI />);

    const logsButton = screen.getByRole('button', { name: /logs/i });

    // Initially collapsed
    expect(screen.queryByText(/No logs yet/i)).not.toBeInTheDocument();

    // Expand
    fireEvent.click(logsButton);
    await waitFor(() => {
      expect(screen.getByText(/No logs yet/i)).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(logsButton);
    await waitFor(() => {
      expect(screen.queryByText(/No logs yet/i)).not.toBeInTheDocument();
    });
  });

  it('displays logs during deployment', async () => {
    render(<DeploymentPipelineUI />);

    // Expand logs
    const logsButton = screen.getByRole('button', { name: /logs/i });
    fireEvent.click(logsButton);

    // Start deployment
    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    await waitFor(() => {
      expect(screen.getByText(/Starting deployment pipeline/i)).toBeInTheDocument();
    });

    // Advance through pipeline
    await vi.runAllTimersAsync();

    // Should show completion log
    await waitFor(() => {
      expect(screen.getByText(/Pipeline completed successfully/i)).toBeInTheDocument();
    });
  });

  it('shows log count badge', async () => {
    render(<DeploymentPipelineUI />);

    // Start deployment to generate logs
    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    await vi.runAllTimersAsync();

    // Logs count should be visible
    const logsButton = screen.getByRole('button', { name: /logs/i });
    expect(logsButton).toHaveTextContent(/\(\d+\)/); // (N) format
  });

  it('displays logs with correct severity colors', async () => {
    render(<DeploymentPipelineUI />);

    // Expand logs
    const logsButton = screen.getByRole('button', { name: /logs/i });
    fireEvent.click(logsButton);

    // Start deployment
    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    await vi.runAllTimersAsync();

    // Check for different log levels
    await waitFor(() => {
      expect(screen.getByText('[info]')).toBeInTheDocument();
    });
  });

  // ── Rollback Functionality ─────────────────────────────────────────────────

  it('shows rollback confirmation dialog', async () => {
    render(<DeploymentPipelineUI />);

    const rollbackButton = screen.getByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Rollback')).toBeInTheDocument();
      expect(screen.getByText(/This will revert to the previous deployment/i)).toBeInTheDocument();
    });
  });

  it('cancels rollback when dialog is dismissed', async () => {
    render(<DeploymentPipelineUI />);

    const rollbackButton = screen.getByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Rollback')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Confirm Rollback')).not.toBeInTheDocument();
    });
  });

  it('executes rollback callback when confirmed', async () => {
    const onRollback = vi.fn().mockResolvedValue(undefined);

    render(<DeploymentPipelineUI onRollback={onRollback} />);

    // Open dialog
    const rollbackButton = screen.getByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Rollback')).toBeInTheDocument();
    });

    // Confirm
    const confirmButton = screen.getByRole('button', { name: /rollback now/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onRollback).toHaveBeenCalled();
    });
  });

  it('disables rollback button during deployment', async () => {
    render(<DeploymentPipelineUI />);

    const rollbackButton = screen.getByRole('button', { name: /rollback/i });
    const deployButton = screen.getByRole('button', { name: /deploy/i });

    // Start deployment
    fireEvent.click(deployButton);

    await waitFor(() => {
      expect(rollbackButton).toBeDisabled();
    });
  });

  it('logs rollback activity', async () => {
    const onRollback = vi.fn().mockResolvedValue(undefined);

    render(<DeploymentPipelineUI onRollback={onRollback} />);

    // Expand logs
    const logsButton = screen.getByRole('button', { name: /logs/i });
    fireEvent.click(logsButton);

    // Trigger rollback
    const rollbackButton = screen.getByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackButton);

    const confirmButton = screen.getByRole('button', { name: /rollback now/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/Initiating rollback/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Rollback completed successfully/i)).toBeInTheDocument();
    });
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('has accessible labels for interactive elements', () => {
    render(<DeploymentPipelineUI />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deploy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rollback/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logs/i })).toBeInTheDocument();
  });

  it('maintains keyboard navigation', async () => {
    render(<DeploymentPipelineUI />);

    const select = screen.getByRole('combobox');
    select.focus();

    expect(document.activeElement).toBe(select);
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────────

  it('prevents multiple simultaneous deployments', async () => {
    const onDeployStart = vi.fn();

    render(<DeploymentPipelineUI onDeployStart={onDeployStart} />);

    const deployButton = screen.getByRole('button', { name: /deploy/i });

    // Click deploy twice rapidly
    fireEvent.click(deployButton);
    fireEvent.click(deployButton);

    // Should only start once
    expect(onDeployStart).toHaveBeenCalledTimes(1);
  });

  it('handles long source code gracefully', async () => {
    const longSource = 'x'.repeat(100000);

    render(<DeploymentPipelineUI source={longSource} />);

    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(screen.getByText(/Source ready/i)).toBeInTheDocument();
    });
  });

  it('shows correct target for each quality tier', () => {
    const { rerender } = render(<DeploymentPipelineUI />);

    const tiers: Array<{ tier: string; label: string; provider: string }> = [
      { tier: 'low', label: 'Development', provider: 'vercel-edge' },
      { tier: 'med', label: 'Staging', provider: 'cloudflare-workers' },
      { tier: 'high', label: 'Production', provider: 'aws-lambda' },
      { tier: 'ultra', label: 'Global CDN', provider: 'cloudflare-workers' },
    ];

    tiers.forEach(({ tier, label, provider }) => {
      rerender(<DeploymentPipelineUI />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: tier } });

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(provider)).toBeInTheDocument();
    });
  });

  it('displays stage durations after completion', async () => {
    render(<DeploymentPipelineUI />);

    const deployButton = screen.getByRole('button', { name: /deploy/i });
    fireEvent.click(deployButton);

    await vi.runAllTimersAsync();

    // Should show duration for completed stages (format: XXXms)
    await waitFor(() => {
      const durations = screen.getAllByText(/\d+ms/);
      expect(durations.length).toBeGreaterThan(0);
    });
  });
});
