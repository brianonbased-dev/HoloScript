'use client';

import { Fragment, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ErrorBoundary, PanelSplitter } from '@holoscript/ui';

/**
 * One slot in the /create right rail.
 *
 * Collapses the ~40 hand-rolled `{xOpen && (<>…</>)}` blocks that used to live
 * inline in app/create/page.tsx into a single declarative table. Two layout
 * shapes are preserved exactly:
 *
 *   - `width: 'resizable'` → a draggable {@link PanelSplitter} followed by a
 *     container sized from the shared `rightPanelW` (the old AI/history/share
 *     family). Multiple resizable panels may be open at once; each gets its own
 *     splitter, matching the previous behaviour.
 *   - `width: <number>`    → a fixed-px rail with a left border (the old
 *     inspector/plugins/governance family, formerly `w-64/72/80/[640px]`).
 *
 * The element itself (with its own custom props + onClose) is supplied by the
 * caller as `content`, so panels with bespoke props (sceneId, onCodeGenerated,
 * onExecutionResult, …) keep working without the host knowing about them.
 */
export interface RightRailPanelDescriptor {
  /** Stable key — use the StudioViewId where one exists. */
  id: string;
  /** Whether this panel is currently open (from panelVisibilityStore). */
  open: boolean;
  /** 'resizable' = splitter + shared width; a number = fixed px + left border. */
  width: 'resizable' | number;
  /** The panel element, pre-wired with its props and close handler. */
  content: ReactNode;
  /** When set, wrap `content` in an {@link ErrorBoundary} with this label. */
  errorLabel?: string;
  /** Extra container classes (e.g. elevated `bg-slate-900 z-20` panels). */
  containerClassName?: string;
}

interface RightRailPanelHostProps {
  descriptors: RightRailPanelDescriptor[];
  /** Shared width (px) for resizable panels, driven by the splitter drag. */
  rightPanelW: number;
  setRightPanelW: Dispatch<SetStateAction<number>>;
}

/** Drag clamp — preserved from the previous inline onDelta handlers. */
const MIN_RIGHT_PANEL_W = 180;
const MAX_RIGHT_PANEL_W = 520;

export function RightRailPanelHost({
  descriptors,
  rightPanelW,
  setRightPanelW,
}: RightRailPanelHostProps) {
  return (
    <>
      {descriptors
        .filter((d) => d.open)
        .map((d) => {
          const body = d.errorLabel ? (
            <ErrorBoundary label={d.errorLabel}>{d.content}</ErrorBoundary>
          ) : (
            d.content
          );

          if (d.width === 'resizable') {
            return (
              <Fragment key={d.id}>
                <PanelSplitter
                  direction="horizontal"
                  onDelta={(delta) =>
                    setRightPanelW((w) =>
                      Math.max(MIN_RIGHT_PANEL_W, Math.min(w - delta, MAX_RIGHT_PANEL_W))
                    )
                  }
                />
                <div
                  className={`flex shrink-0 flex-col${
                    d.containerClassName ? ` ${d.containerClassName}` : ''
                  }`}
                  style={{ width: rightPanelW }}
                >
                  {body}
                </div>
              </Fragment>
            );
          }

          return (
            <div
              key={d.id}
              className={`flex shrink-0 flex-col border-l border-studio-border${
                d.containerClassName ? ` ${d.containerClassName}` : ''
              }`}
              style={{ width: d.width }}
            >
              {body}
            </div>
          );
        })}
    </>
  );
}
