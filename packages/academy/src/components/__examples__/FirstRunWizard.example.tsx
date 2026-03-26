/**
 * FirstRunWizard Usage Example
 *
 * This example demonstrates how to integrate the FirstRunWizard component
 * into your application.
 */

import React, { useState } from 'react';
import { FirstRunWizard } from '../FirstRunWizard';

export function FirstRunWizardExample() {
  const [showWizard, setShowWizard] = useState(false);

  const handleComplete = () => {
    console.log('[FirstRunWizard] Onboarding completed!');
    // Redirect user to main app, set flag in user preferences, etc.
  };

  return (
    <div>
      <button
        onClick={() => setShowWizard(true)}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-400"
      >
        Start Onboarding
      </button>

      {showWizard && (
        <FirstRunWizard onClose={() => setShowWizard(false)} onComplete={handleComplete} />
      )}
    </div>
  );
}

/**
 * Integration with Next.js App Router
 *
 * Add to your main layout or page:
 */
export function AppWithFirstRun() {
  // Check if user has completed onboarding
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('holoscript-onboarding-completed') === 'true';
  });

  const handleComplete = () => {
    localStorage.setItem('holoscript-onboarding-completed', 'true');
    setHasCompletedOnboarding(true);
  };

  return (
    <>
      {!hasCompletedOnboarding && (
        <FirstRunWizard
          onClose={() => setHasCompletedOnboarding(true)}
          onComplete={handleComplete}
        />
      )}

      {/* Rest of your app */}
      <main>Your HoloScript Studio interface</main>
    </>
  );
}

/**
 * Features Demonstrated:
 *
 * 1. GitHub OAuth Connection
 *    - Opens GitHubOAuthModal for device flow authentication
 *    - Integrates with connectorStore for connection state
 *
 * 2. Template Selection
 *    - 3 starter templates: VR Game, 3D Web Experience, Art Gallery
 *    - Visual selection with icons and tags
 *
 * 3. One-Click Deployment
 *    - Deploys to /api/deploy endpoint
 *    - Real-time progress bar (0-100%)
 *    - Error handling with retry
 *
 * 4. Completion & URL Visit
 *    - Success animation
 *    - Clickable deployed URL
 *    - Auto-close after 1 second
 *
 * 5. Progress Persistence
 *    - Saves to localStorage after each step
 *    - Restores on wizard re-open
 *    - Clears on completion
 *
 * 6. Skip Functionality
 *    - Skip button on all steps
 *    - Auto-selects defaults when skipping
 *    - Closes wizard on final skip
 *
 * 7. Accessibility
 *    - Keyboard navigation (Tab, Enter, Escape)
 *    - Screen reader friendly labels
 *    - Focus management between steps
 *    - Semantic HTML structure
 */
