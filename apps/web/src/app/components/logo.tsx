/**
 * Official AskABD Logo — used across the Enterprise Operations Center.
 * Replaces all temporary "A" icons and placeholder branding.
 */
export function AskABDLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-label="AskABD" role="img">
      <rect width="32" height="32" rx="8" fill="url(#askabd-logo-grad)" />
      <path d="M10 22L16 10L22 22" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 18H20" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="10" r="1.5" fill="white" />
      <defs>
        <linearGradient id="askabd-logo-grad" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#3B82F6" />
          <stop offset="0.5" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#D946EF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function AskABDLogoFull({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <AskABDLogo size={28} />
      <span className="text-sm font-bold text-gray-900">AskABD</span>
    </div>
  );
}
