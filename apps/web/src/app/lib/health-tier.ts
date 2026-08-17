/**
 * Single shared mapping from a real computed health score (ClientHealthService,
 * apps/api/src/services/client-health-service.ts) to a presentation tier.
 *
 * These are the exact thresholds already used by the client Scorecard page
 * (clients/[clientId]/scorecard/page.tsx) — defined once here so the directory,
 * dashboard, and scorecard never show different labels for the same score.
 */
export function healthTierLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Needs Improvement';
  if (score >= 40) return 'At Risk';
  return 'Critical';
}

export function healthTierColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-orange-600';
  return 'text-red-600';
}

/** Relative "Updated X ago" / "Not yet calculated" — never silently shows a number with no timestamp. */
export function formatComputedAt(computedAt: string | null): string {
  if (!computedAt) return 'Not yet calculated';
  const ms = Date.now() - new Date(computedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}
