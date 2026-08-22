import { AccountSecurityManager } from './account-security-manager';

/**
 * Real MFA enrollment/management for the logged-in staff identity — the
 * missing piece that made MFA "enrollment exists but no way to reach it"
 * (askabd-identity's MFA backend was real and complete; there was simply no
 * UI to enroll, so no identity in this environment ever had it active).
 * Calls askabd-identity directly (the same real routes the login challenge
 * flow uses), self-only per requireSelf() there.
 */
export default function AccountSecurityPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 animate-in">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Security</h1>
      <p className="text-sm text-gray-500 mb-8">Manage two-factor authentication for your own AskABD staff account.</p>
      <AccountSecurityManager />
    </div>
  );
}
