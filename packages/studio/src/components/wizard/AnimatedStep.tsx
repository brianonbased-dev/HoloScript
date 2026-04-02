'use client';

import { useState, useEffect, useRef } from 'react';
import { DEBOUNCE_INPUT } from '@/lib/ui-timings';

interface AnimatedStepProps {
  visible: boolean;
  direction: 'left' | 'right';
  children: React.ReactNode;
}

export function AnimatedStep({ visible, direction, children }: AnimatedStepProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), DEBOUNCE_INPUT);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  const enterFrom = direction === 'right' ? 'translate-x-8' : '-translate-x-8';

  return (
    <div
      ref={ref}
      className={`absolute inset-0 transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-x-0' : `opacity-0 ${enterFrom}`
      }`}
    >
      {children}
    </div>
  );
}
