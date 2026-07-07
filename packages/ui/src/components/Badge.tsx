import * as React from 'react';
import { cn } from '../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

const badgeVariants = {
  default: 'border-transparent bg-studio-accent-subtle text-studio-accent',
  secondary: 'border-transparent bg-studio-panel text-studio-text',
  outline: 'text-studio-text-secondary border-studio-border',
  destructive: 'border-transparent bg-studio-error-subtle text-studio-error',
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-studio-accent focus:ring-offset-2',
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
