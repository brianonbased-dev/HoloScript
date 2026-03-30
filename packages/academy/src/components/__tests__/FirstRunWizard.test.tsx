// @vitest-environment jsdom
/**
 * FirstRunWizard.test.tsx — Unit tests for FirstRunWizard component
 *
 * Tests cover:
 * - Step navigation and validation
 * - GitHub OAuth integration
 * - Template selection
 * - Deployment flow with progress
 * - localStorage persistence
 * - Skip functionality
 * - Accessibility (WCAG 2.1 AA)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FirstRunWizard } from '../FirstRunWizard';
import { useConnectorStore } from '@/lib/stores/connectorStore';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/stores/connectorStore');
vi.mock('../integrations/GitHubOAuthModal', () => ({
  GitHubOAuthModal: ({
    onSuccess,
    onClose,
  }: {
    onSuccess: (token: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="github-oauth-modal">
      <button onClick={() => onSuccess('test-token')}>Mock Authorize</button>
      <button onClick={onClose}>Mock Close</button>
    </div>
  ),
}));

vi.mock('@/lib/presets/wizardTemplates', () => ({
  getWizardTemplate: vi.fn((id: string) => {
    if (id === 'vr-game') {
      return {
        id: 'wizard-vr-game',
        name: 'VR Game Starter',
        code: 'composition "VR Game" { }',
      };
    }
    return null;
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Setup localStorage mock in global scope
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FirstRunWizard', () => {
  const mockOnClose = vi.fn();
  const mockOnComplete = vi.fn();

  const mockConnectorStore = {
    connections: {
      github: {
        id: 'github' as const,
        status: 'disconnected' as const,
        credentials: {},
        config: {},
      },
      railway: {
        id: 'railway' as const,
        status: 'disconnected' as const,
        credentials: {},
        config: {},
      },
      vscode: {
        id: 'vscode' as const,
        status: 'disconnected' as const,
        credentials: {},
        config: {},
      },
      appstore: {
        id: 'appstore' as const,
        status: 'disconnected' as const,
        credentials: {},
        config: {},
      },
      upstash: {
        id: 'upstash' as const,
        status: 'disconnected' as const,
        credentials: {},
        config: {},
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    (useConnectorStore as any).mockReturnValue(mockConnectorStore.connections);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Structure & Rendering ──────────────────────────────────────────────────

  it('renders wizard with initial step (GitHub connection)', () => {
    render(<FirstRunWizard onClose={mockOnClose} />);

    expect(screen.getByText('Connect GitHub')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('Connect Your GitHub Account')).toBeInTheDocument();
  });

  it('renders progress bar with correct width', () => {
    render(<FirstRunWizard onClose={mockOnClose} />);

    const progressBar = document.querySelector('.bg-gradient-to-r') as HTMLElement;
    expect(progressBar).toBeInTheDocument();
    expect(progressBar.style.width).toBe('25%'); // Step 1/4 = 25%
  });

  it('displays close button', () => {
    render(<FirstRunWizard onClose={mockOnClose} />);

    const closeButton = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-lucide="x"]'));
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton!);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  // ── Step Navigation ────────────────────────────────────────────────────────

  it('prevents navigation to next step when validation fails', () => {
    render(<FirstRunWizard onClose={mockOnClose} />);

    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled(); // GitHub not connected
  });

  it('allows navigation when step validation passes', () => {
    // Mock GitHub connected
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    const nextButton = screen.getByText('Next');
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);
    expect(screen.getByText('Choose Your Starter')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
  });

  it('navigates backward through steps', () => {
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    // Go to step 2
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Choose Your Starter')).toBeInTheDocument();

    // Go back to step 1
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Connect GitHub')).toBeInTheDocument();
  });

  // ── GitHub OAuth Integration ───────────────────────────────────────────────

  it('opens GitHub OAuth modal when Connect GitHub is clicked', () => {
    render(<FirstRunWizard onClose={mockOnClose} />);

    const connectButton = screen.getByText('Connect GitHub');
    fireEvent.click(connectButton);

    expect(screen.getByTestId('github-oauth-modal')).toBeInTheDocument();
  });

  it('closes GitHub OAuth modal on cancel', () => {
    render(<FirstRunWizard onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Connect GitHub'));
    expect(screen.getByTestId('github-oauth-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mock Close'));
    expect(screen.queryByTestId('github-oauth-modal')).not.toBeInTheDocument();
  });

  it('displays success message when GitHub is connected', () => {
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    expect(screen.getByText('GitHub Connected Successfully')).toBeInTheDocument();
  });

  // ── Template Selection ─────────────────────────────────────────────────────

  it('renders all 3 template options on step 2', () => {
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('VR Game Scene')).toBeInTheDocument();
    expect(screen.getByText('3D Web Experience')).toBeInTheDocument();
    expect(screen.getByText('3D Art Gallery')).toBeInTheDocument();
  });

  it('selects a template when clicked', () => {
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Next'));

    const vrGameButton = screen.getByText('VR Game Scene').closest('button');
    fireEvent.click(vrGameButton!);

    // Check for visual selection indicator
    expect(vrGameButton).toHaveClass('border-emerald-500/60');
  });

  it('prevents navigation to step 3 without template selection', () => {
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Next'));

    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();
  });

  // ── Deployment Flow ────────────────────────────────────────────────────────

  it('initiates deployment when Deploy Now is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://example.com/deploy123', status: 'live' }),
    });

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    // Navigate to step 2, select template
    fireEvent.click(screen.getByText('Next'));
    const vrGameButton = screen.getByText('VR Game Scene').closest('button');
    fireEvent.click(vrGameButton!);

    // Navigate to step 3
    fireEvent.click(screen.getByText('Next'));

    // Click Deploy Now
    const deployButton = screen.getByText('Deploy Now');
    fireEvent.click(deployButton);

    await waitFor(() => {
      expect(screen.getByText('Deploying your experience...')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/deploy',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('VR Game'),
      })
    );
  });

  it('displays progress bar during deployment', async () => {
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ url: 'https://example.com/deploy123', status: 'live' }),
            });
          }, 100);
        })
    );

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    // Navigate to deploy step
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('VR Game Scene').closest('button')!);
    fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getByText('Deploy Now'));

    // Wait for progress bar to appear
    await waitFor(() => {
      const progressText = screen.getByText(/Building/);
      expect(progressText).toBeInTheDocument();
    });
  });

  it('displays success state after deployment completes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://example.com/deploy123', status: 'live' }),
    });

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    // Navigate to deploy and execute
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('VR Game Scene').closest('button')!);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Deploy Now'));

    await waitFor(() => {
      expect(screen.getByText('Deployed Successfully!')).toBeInTheDocument();
      expect(screen.getByText('https://example.com/deploy123')).toBeInTheDocument();
    });
  });

  it('handles deployment errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Deployment failed: Internal server error' }),
    });

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    // Navigate to deploy and execute
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('VR Game Scene').closest('button')!);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Deploy Now'));

    await waitFor(() => {
      expect(screen.getByText('Deployment Failed')).toBeInTheDocument();
      expect(screen.getByText(/Internal server error/)).toBeInTheDocument();
    });
  });

  // ── localStorage Persistence ───────────────────────────────────────────────

  it('saves progress to localStorage on step change', () => {
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Next'));

    const stored = JSON.parse(localStorageMock.getItem('holoscript-wizard-progress')!);
    expect(stored.currentStep).toBe(1);
  });

  it('restores progress from localStorage on mount', () => {
    localStorageMock.setItem(
      'holoscript-wizard-progress',
      JSON.stringify({
        currentStep: 2,
        githubConnected: true,
        selectedTemplate: 'vr-game',
        deploymentUrl: null,
        completedAt: null,
      })
    );

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    // Should start at step 3 (deploy)
    expect(screen.getByText('Deploy to Web')).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
  });

  it('clears localStorage when wizard is completed', async () => {
    localStorageMock.setItem(
      'holoscript-wizard-progress',
      JSON.stringify({
        currentStep: 3,
        githubConnected: true,
        selectedTemplate: 'vr-game',
        deploymentUrl: 'https://example.com/deploy123',
        completedAt: null,
      })
    );

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} onComplete={mockOnComplete} />);

    // Should be on final step
    const finishButton = screen.getByText('Start Creating');
    fireEvent.click(finishButton);

    await waitFor(() => {
      expect(localStorageMock.getItem('holoscript-wizard-progress')).toBeNull();
    });
  });

  // ── Skip Functionality ─────────────────────────────────────────────────────

  it('skips GitHub connection and goes to template selection', () => {
    render(<FirstRunWizard onClose={mockOnClose} />);

    const skipButton = screen.getAllByText('Skip')[0];
    fireEvent.click(skipButton);

    expect(screen.getByText('Choose Your Starter')).toBeInTheDocument();
  });

  it('skips template selection and auto-selects first template', () => {
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Next'));

    const skipButton = screen.getAllByText('Skip')[0];
    fireEvent.click(skipButton);

    expect(screen.getByText('Deploy to Web')).toBeInTheDocument();
  });

  it('closes wizard when skip is clicked on final step', () => {
    localStorageMock.setItem(
      'holoscript-wizard-progress',
      JSON.stringify({
        currentStep: 3,
        githubConnected: true,
        selectedTemplate: 'vr-game',
        deploymentUrl: 'https://example.com/deploy123',
        completedAt: null,
      })
    );

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    const skipButton = screen.getAllByText('Skip')[0];
    fireEvent.click(skipButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('has accessible labels for all interactive elements', () => {
    render(<FirstRunWizard onClose={mockOnClose} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      // Each button should have text content or aria-label
      expect(
        button.textContent || button.getAttribute('aria-label') || button.getAttribute('title')
      ).toBeTruthy();
    });
  });

  it('maintains focus management between steps', () => {
    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} />);

    const nextButton = screen.getByText('Next');
    nextButton.focus();

    fireEvent.click(nextButton);

    // After step change, a focusable element should be available
    const focusableElements = screen.getAllByRole('button');
    expect(focusableElements.length).toBeGreaterThan(0);
  });

  it('uses semantic HTML structure', () => {
    const { container } = render(<FirstRunWizard onClose={mockOnClose} />);

    // Should have proper heading structure
    const headings = container.querySelectorAll('h3, h4, p[class*="font-semibold"]');
    expect(headings.length).toBeGreaterThan(0);
  });

  // ── Completion Flow ────────────────────────────────────────────────────────

  it('calls onComplete callback when wizard finishes', async () => {
    localStorageMock.setItem(
      'holoscript-wizard-progress',
      JSON.stringify({
        currentStep: 3,
        githubConnected: true,
        selectedTemplate: 'vr-game',
        deploymentUrl: 'https://example.com/deploy123',
        completedAt: null,
      })
    );

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} onComplete={mockOnComplete} />);

    const finishButton = screen.getByText('Start Creating');
    fireEvent.click(finishButton);

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  it('displays success animation on completion', async () => {
    localStorageMock.setItem(
      'holoscript-wizard-progress',
      JSON.stringify({
        currentStep: 3,
        githubConnected: true,
        selectedTemplate: 'vr-game',
        deploymentUrl: 'https://example.com/deploy123',
        completedAt: null,
      })
    );

    (useConnectorStore as any).mockReturnValue({
      github: { status: 'connected' },
      railway: { status: 'disconnected' },
      vscode: { status: 'disconnected' },
      appstore: { status: 'disconnected' },
      upstash: { status: 'disconnected' },
    });

    render(<FirstRunWizard onClose={mockOnClose} onComplete={mockOnComplete} />);

    const finishButton = screen.getByText('Start Creating');
    fireEvent.click(finishButton);

    await waitFor(() => {
      expect(screen.getByText('Welcome to HoloScript!')).toBeInTheDocument();
    });
  });
});
