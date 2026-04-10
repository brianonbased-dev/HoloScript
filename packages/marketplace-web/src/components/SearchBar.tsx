'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  isLoading = false,
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div
        className={`
          relative flex items-center bg-white dark:bg-zinc-800 
          rounded-xl border-2 transition-all duration-200
          ${
            isFocused
              ? 'border-holoscript-500 shadow-lg shadow-holoscript-500/10'
              : 'border-zinc-200 dark:border-zinc-700'
          }
        `}
      >
        {/* Search Icon */}
        <div className="pl-4 text-zinc-400">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Search className="h-5 w-5" />
          )}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="
            flex-1 py-4 px-3 bg-transparent 
            text-zinc-900 dark:text-white 
            placeholder-zinc-400
            focus:outline-none
          "
        />

        {/* Clear Button */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            aria-label="Clear search"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Keyboard Shortcut Hint */}
        {!value && !isFocused && (
          <div className="hidden sm:flex items-center gap-1 pr-4 text-xs text-zinc-400">
            <kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded font-mono">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded font-mono">K</kbd>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          className="
            mr-2 px-4 py-2 
            bg-holoscript-500 hover:bg-holoscript-600 
            text-white text-sm font-medium 
            rounded-lg transition-colors
          "
        >
          Search
        </button>
      </div>
    </form>
  );
}
