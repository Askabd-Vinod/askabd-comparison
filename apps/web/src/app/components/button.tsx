import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * AskABD Design System — Canonical Action
 *
 * Standardizes presentation only (height, padding, radius, typography,
 * hover/focus/disabled/loading states) — never behavior. Existing buttons
 * elsewhere were not mechanically replaced (many are embedded in complex,
 * already-tested stateful components); this is the shared implementation new
 * and touched call sites should use going forward.
 */
export type ActionVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'link';

const VARIANT_CLASSES: Record<ActionVariant, string> = {
  primary: 'bg-gray-900 text-white hover:bg-gray-800 focus-visible:ring-gray-900 disabled:bg-gray-300',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-400 disabled:text-gray-300 disabled:border-gray-200',
  tertiary: 'bg-transparent text-gray-600 hover:bg-gray-50 focus-visible:ring-gray-400 disabled:text-gray-300',
  destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 disabled:bg-red-200',
  link: 'bg-transparent text-purple-600 hover:text-purple-800 underline-offset-2 hover:underline focus-visible:ring-purple-500 px-0 py-0',
};

const BASE_CLASSES = 'inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg px-3.5 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed';

interface ActionProps {
  variant?: ActionVariant;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}

export function Action({
  variant = 'secondary', loading, children, className = '', disabled, ...rest
}: ActionProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ActionLink({
  variant = 'secondary', href, children, className = '',
}: ActionProps & { href: string }) {
  return (
    <Link href={href} className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Link>
  );
}
