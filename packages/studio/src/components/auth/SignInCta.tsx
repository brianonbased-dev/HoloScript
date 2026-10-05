'use client';

/**
 * Visible Sign-in control for empty / unauthenticated states.
 *
 * Routes to `/auth/signin` (GitHub provider page) with an optional callbackUrl
 * so gated surfaces (Settings, nav, home) stay actionable when session is {}.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DEFAULT_CLASS =
  'inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 hover:text-emerald-200';

export function SignInCta({
  label = 'Sign in',
  className,
  callbackUrl,
  compact = false,
}: {
  label?: string;
  className?: string;
  /** Override return path after OAuth. Defaults to current pathname. */
  callbackUrl?: string;
  /** Tighter styling for sidebar / inline nav. */
  compact?: boolean;
}) {
  const pathname = usePathname();
  const target = callbackUrl ?? pathname ?? '/';
  const href = `/auth/signin?callbackUrl=${encodeURIComponent(target)}`;

  const classes =
    className ??
    (compact
      ? 'flex w-full items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition'
      : DEFAULT_CLASS);

  return (
    <Link href={href} className={classes} data-testid="sign-in-cta" aria-label={label}>
      {label}
    </Link>
  );
}
