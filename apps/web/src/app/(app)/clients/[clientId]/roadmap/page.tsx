import { CapabilityPlaceholder } from '../capability-placeholder';

/**
 * PREVIOUSLY: this page showed a hardcoded, identical-for-every-mock-client transformation
 * roadmap (fixed phases like "Quick Wins", "30-Day Plan", literal items such as "Implement
 * CI/CD pipeline" marked "completed") plus AI-insight text computed from that fabricated
 * progress percentage.
 *
 * NOW: no real per-client transformation-roadmap/plan table or API exists anywhere in this
 * platform (confirmed by direct schema search — the closest real concepts are
 * `oc_transformation_outcomes`, a different "measured optimization outcome" idea, and the
 * client lifecycle stage, which already has its own real page). Per this milestone's explicit
 * instruction ("if real backend does not exist: replace with an honest Not Yet Available state
 * — do not invent an API just to make the page appear complete"), this page now shows the same
 * honest empty state used platform-wide for capabilities with no database-backed
 * implementation yet, rather than fabricated phases for every client.
 */
export default function ClientRoadmapPage() {
  return <CapabilityPlaceholder title="Roadmap" description="Transformation roadmap for this client — not yet a tracked, database-backed capability." />;
}
