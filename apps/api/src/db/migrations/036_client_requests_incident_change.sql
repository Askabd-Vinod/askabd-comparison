-- Incident / Change request types (2026-08-22, SDLC-completion pass, Section 14
-- "POST-DELIVERY / OPERATIONS").
--
-- Real gap: the platform had no way for a customer to report a real
-- post-delivery incident or request a real change. Rather than build a
-- second, parallel ITSM subsystem (a separate incident/change table, its own
-- state machine, its own audit wiring, its own staff UI), this reuses the
-- EXACT already-real, already-tested, already-audited request pipeline from
-- migration 033 (oc_client_requests) — same table, same state machine, same
-- `priority` field doubling as severity, same staff approval UI, same
-- customer visibility rules.
--
-- oc_client_requests_request_type_check previously only allowed
-- ('service', 'connector', 'support', 'requirement'). Widening it — not
-- dropping it — to also allow 'incident' and 'change'. This is a real,
-- additive constraint change with no data migration required (no existing
-- row uses either new value).
ALTER TABLE oc_client_requests DROP CONSTRAINT IF EXISTS oc_client_requests_request_type_check;
ALTER TABLE oc_client_requests ADD CONSTRAINT oc_client_requests_request_type_check
  CHECK (request_type = ANY (ARRAY['service'::text, 'connector'::text, 'support'::text, 'requirement'::text, 'incident'::text, 'change'::text]));
