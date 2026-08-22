'use client';
import Link from 'next/link';

interface KpiCardProps {
  href?: string;
  label: string;
  value: string | number;
  color?: string;
  description?: string;
  criteria?: string;
  warn?: boolean;
  icon?: string;
  sub?: string;
}

/**
 * Unified KPI tile used across the entire Operations Centre.
 * Shows value + label with a hover tooltip explaining what the metric means and the criteria behind it.
 *
 * Found during the data-integrity audit: this previously had an `includeNewClients`
 * prop (never passed `true` by any caller — dead code) that added a localStorage-only
 * "onboarded clients" count on top of the real `value` prop. Removed — every value
 * this component displays now comes only from what its caller explicitly passes in.
 */
export function KpiCard({ href, label, value, color, description, criteria, warn, icon, sub }: KpiCardProps) {
  const warnStyles = warn ? 'border-orange-200 bg-orange-50/50' : 'border-gray-200';
  const valueColor = color || (warn ? 'text-orange-600' : 'text-gray-900');

  const content = (
    <>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-0 group-hover/card:opacity-100 transition-opacity" />
      {icon && <span className="text-lg mb-1 block">{icon}</span>}
      <p className={`text-xl font-extrabold ${valueColor} group-hover/card:text-purple-700 transition`}>
        {value}
      </p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-medium">{label}</p>
      {sub && <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>}
      {description && (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity">
          <span className="text-[9px] text-gray-400 font-bold">?</span>
        </div>
      )}
    </>
  );

  const tooltip = description ? (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 sm:w-64 max-w-[calc(100vw-2rem)] bg-gray-900 text-white text-[11px] rounded-lg p-3 shadow-xl opacity-0 invisible group-hover/card:opacity-100 group-hover/card:visible transition-all duration-200 pointer-events-none">
      <p className="font-semibold text-white/90 mb-1.5">{label}</p>
      <p className="text-gray-300 leading-relaxed">{description}</p>
      {criteria && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <p className="text-[10px] text-purple-300 font-medium uppercase tracking-wide mb-0.5">Criteria</p>
          <p className="text-gray-400 leading-relaxed">{criteria}</p>
        </div>
      )}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900" />
    </div>
  ) : null;

  if (href) {
    return (
      <div className="relative group/card">
        <Link href={href} className={`block bg-white rounded-xl border ${warnStyles} p-4 text-center hover:shadow-lg hover:border-purple-300 hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden`}>
          {content}
        </Link>
        {tooltip}
      </div>
    );
  }

  return (
    <div className="relative group/card">
      <div className={`bg-white rounded-xl border ${warnStyles} p-4 text-center hover:shadow-lg hover:border-purple-300 hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden cursor-default`}>
        {content}
      </div>
      {tooltip}
    </div>
  );
}
