-- Real remediation execution — closes the gap found in the final adversarial audit:
-- RemediationPanel (apps/web) previously simulated its entire step-by-step execution
-- client-side (setInterval, fabricated durations/evidence), with the real backend
-- (oc_remediations) only ever receiving a phase transition and a final "close ticket"
-- call. This column links a remediation to the real oc_operations row created when
-- execution genuinely starts, so a browser refresh (or a different staff member
-- opening the same incident) reads the same real, server-authoritative progress —
-- never a client-only fake timer.
ALTER TABLE oc_remediations ADD COLUMN IF NOT EXISTS operation_id TEXT;
CREATE INDEX IF NOT EXISTS idx_oc_remediations_operation ON oc_remediations(operation_id);
