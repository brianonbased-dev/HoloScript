'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useCommandPalette } from './useCommandPalette';
import { CATEGORY_META, type CommandEntry, type CommandCategory } from './CommandRegistry';

// ─── Styles ─────────────────────────────────────────────────────

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '15vh',
};

const PALETTE_STYLE: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  background: '#0d1020',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 16,
  boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
  overflow: 'hidden',
  fontFamily: "'Inter', system-ui, sans-serif",
  color: '#d0d0e8',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '16px 20px 16px 48px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  color: '#e8e8f8',
  fontSize: 15,
  outline: 'none',
  fontFamily: 'inherit',
};

// ─── Component ──────────────────────────────────────────────────

/**
 * CommandPalette -- Cmd+K powered command palette for unified feature discovery.
 *
 * Features:
 * - Global Cmd+K / Ctrl+K keyboard shortcut
 * - Fuzzy search across all registered commands
 * - Arrow key navigation with highlighted selection
 * - Enter to execute, Escape to close
 * - Grouped by category with visual separators
 * - Keyboard shortcut hints per command
 */
export function CommandPalette() {
  const {
    isOpen,
    close,
    query,
    setQuery,
    results,
    selectedIndex,
    setSelectedIndex,
    selectPrevious,
    selectNext,
    executeSelected,
    executeCommand,
    totalCommands,
  } = useCommandPalette();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Handle keyboard nav in the input
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          selectNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          selectPrevious();
          break;
        case 'Enter':
          e.preventDefault();
          executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
      }
    },
    [selectNext, selectPrevious, executeSelected, close],
  );

  // Click on overlay backdrop closes palette
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        close();
      }
    },
    [close],
  );

  if (!isOpen) return null;

  // Group results by category for display
  const grouped = new Map<CommandCategory, CommandEntry[]>();
  for (const cmd of results) {
    const list = grouped.get(cmd.category) || [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }
  const sortedGroups = Array.from(grouped.entries()).sort(
    (a, b) => CATEGORY_META[a[0]].order - CATEGORY_META[b[0]].order,
  );

  // Flat index tracking for selection
  let flatIndex = 0;

  return (
    <div
      style={OVERLAY_STYLE}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div style={PALETTE_STYLE}>
        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 18,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 16,
              opacity: 0.4,
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          >
            &gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={`Search ${totalCommands} commands...`}
            style={INPUT_STYLE}
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <span
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10,
              color: '#556677',
              padding: '2px 6px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            ESC
          </span>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Command results"
          style={{
            maxHeight: 400,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {sortedGroups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: '#556677', fontSize: 13 }}>
              No commands match &quot;{query}&quot;
            </div>
          )}

          {sortedGroups.map(([category, commands]) => (
            <div key={category}>
              {/* Category header */}
              <div
                style={{
                  padding: '8px 16px 4px',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  color: '#667788',
                }}
              >
                {CATEGORY_META[category].label}
              </div>

              {/* Commands in category */}
              {commands.map((cmd) => {
                const idx = flatIndex++;
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={cmd.id}
                    role="option"
                    aria-selected={isSelected}
                    data-selected={isSelected}
                    onClick={() => executeCommand(cmd.id)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 16px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                      borderLeft: isSelected ? '2px solid #4ecdc4' : '2px solid transparent',
                      transition: 'background 0.1s, border-color 0.1s',
                    }}
                  >
                    {/* Icon */}
                    {cmd.icon && (
                      <span style={{ fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0 }}>
                        {cmd.icon}
                      </span>
                    )}

                    {/* Label + description */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? '#e8e8f8' : '#b0b0c8',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cmd.label}
                      </div>
                      {cmd.description && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#667788',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cmd.description}
                        </div>
                      )}
                    </div>

                    {/* Keyboard shortcut */}
                    {cmd.shortcut && (
                      <span
                        style={{
                          fontSize: 10,
                          color: '#556677',
                          padding: '2px 6px',
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: 4,
                          border: '1px solid rgba(255,255,255,0.06)',
                          flexShrink: 0,
                        }}
                      >
                        {cmd.shortcut}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: 10,
            color: '#556677',
          }}
        >
          <span>
            {results.length} of {totalCommands} commands
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <span>
              <kbd style={{ padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                &uarr;&darr;
              </kbd>{' '}
              navigate
            </span>
            <span>
              <kbd style={{ padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                &crarr;
              </kbd>{' '}
              execute
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
