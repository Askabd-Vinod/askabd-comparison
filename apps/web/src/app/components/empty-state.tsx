/**
 * AskABD Design System — Canonical Empty State
 *
 * Structure: icon / WHAT's missing / WHY it matters / what action creates it.
 * Every "nothing here yet" screen in the app should use this instead of a bare
 * "No data" string — matches the same what/why/action shape as ErrorState.
 */
import type { ReactNode } from 'react';

export function EmptyState({
  icon = '📋',
  title,
  explanation,
  action,
}: {
  icon?: string;
  title: string;
  explanation?: string;
  action?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border p-8 text-center">
      <div className="text-3xl mb-2" aria-hidden="true">{icon}</div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {explanation && <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">{explanation}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
