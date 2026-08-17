/**
 * Honest disclosure for screens whose figures come from sample/demo client
 * records (apps/web/src/app/lib/mock-clients.ts) rather than live AskABD data.
 *
 * Why this exists: an audit of this page found every headline number computed
 * from fabricated data with no indication to the viewer — the opposite of the
 * "can I trust this information?" standard AskABD needs to meet. Rewiring
 * these screens to real aggregation APIs is a real backend project (tracked
 * separately, out of scope for a UI-only pass); until that's done, the
 * honest fix is to say so plainly rather than let the numbers imply otherwise.
 *
 * Real, database-backed client data (created via onboarding) is unaffected —
 * this banner only appears on screens whose figures are sample data.
 */
export function DemoDataBanner() {
  return (
    <div className="mb-4 flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2">
      <span aria-hidden="true">ℹ️</span>
      <span>
        <span className="font-semibold">Sample data.</span> The figures on this screen illustrate the platform using representative demo clients, not live records.
        Real onboarded clients appear separately below.
      </span>
    </div>
  );
}
