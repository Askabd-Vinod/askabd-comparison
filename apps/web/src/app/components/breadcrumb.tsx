import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  // flex-wrap (not nowrap) — found during the 2026-08-22 responsive audit:
  // a long chain (Dashboard / Clients / <client id> / Transformations) has
  // no wrap point, so on a 375px viewport it silently pushed the whole page
  // ~19px past the right edge instead of just wrapping to a second line.
  return (
    <nav className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-sm mb-6" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <span className="text-gray-300 shrink-0">/</span>}
          {item.href ? (
            <Link href={item.href} className="text-gray-500 hover:text-gray-900 transition truncate max-w-[40vw] sm:max-w-none">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium truncate max-w-[40vw] sm:max-w-none">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
