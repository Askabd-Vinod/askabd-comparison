import Image from 'next/image';

/**
 * Auth layout — the genuinely minimal shell for /staff/login, /login,
 * /accept-invitation, and any forgot/reset-password pages.
 *
 * Deliberately contains NONE of: header/main-nav/client-nav/platform-nav,
 * StaffAuthGuard, authenticated data-fetching, or workspace UI. Just AskABD
 * branding, a centered card area for the page's own form, and a minimal footer.
 * This is what makes the fix structural rather than cosmetic: pages under this
 * group physically cannot render the staff console shell, because this layout
 * — not `(app)/layout.tsx` — is their nearest ancestor.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <Image src="/logo.png" alt="AskABD" width={36} height={36} className="object-contain" />
        <span className="text-lg font-bold text-gray-900 tracking-wide">AskABD</span>
      </div>
      <div className="w-full flex justify-center">{children}</div>
      <footer className="mt-10 text-center text-[11px] text-gray-400">
        &copy; 2026 AskABD Technologies. All rights reserved.
      </footer>
    </div>
  );
}
