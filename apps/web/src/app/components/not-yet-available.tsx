import Link from 'next/link';

/**
 * Honest empty state for a client-scoped capability that has no real backend
 * data source yet — used instead of silently rendering fabricated sample data.
 * See docs/real-data-integrity-register.md for the full inventory this covers.
 */
export function NotYetAvailable({ title, description, alternateHref, alternateLabel }: {
  title: string;
  description: string;
  alternateHref?: string;
  alternateLabel?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-500 mt-1.5 max-w-md mx-auto">{description}</p>
      {alternateHref && (
        <Link href={alternateHref} className="inline-block mt-3 text-xs font-medium text-purple-600 hover:text-purple-800">
          {alternateLabel || 'View →'}
        </Link>
      )}
    </div>
  );
}
