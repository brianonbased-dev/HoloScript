import * as React from 'react';
import { cn } from '../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

const badgeVariants = {
  default: 'border-transparent bg-emerald-500/20 text-emerald-400',
  secondary: 'border-transparent bg-slate-800 text-slate-100',
  outline: 'text-slate-300 border-slate-700',
  destructive: 'border-transparent bg-red-500/20 text-red-400',
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
