import React from 'react';
import { Check, X as XIcon } from 'lucide-react';

export function PlatformCell({ supported }: { supported: boolean }) {
  return supported ? (
    <Check className="h-3 w-3 text-green-400 mx-auto" />
  ) : (
    <XIcon className="h-3 w-3 text-red-400/30 mx-auto" />
  );
}

export function CoverageBadge({
  has,
  label,
  icon: Icon,
}: {
  has: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] ${
        has ? 'bg-green-900/40 text-green-300' : 'bg-red-900/20 text-red-400/50'
      }`}
      title={`${label}: ${has ? 'Yes' : 'No'}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
