-- Real, seed document templates (roadmap Phase 3) — a data migration, not
-- new code, matching the existing precedent (015_multi_framework_seed.sql).
-- These three are deliberately the full, honest starting set: each maps
-- directly onto a real, already-fully-built platform capability (Business
-- Requirements Intelligence, Gap Analysis, Current State Assessment), so
-- every section this migration defines can genuinely be populated from
-- real data today — never an aspirational template with no real fetcher
-- behind it. New document types (the other ~44 named in the roadmap) are
-- added the same way: a new INSERT here (or via the real
-- POST /oc/document-templates route) once a real data-fetcher exists for
-- every section it needs — the engine itself needs no code change.

INSERT INTO document_templates (document_type, name, description, sections, approval_required)
VALUES (
  'brd',
  'Business Requirements Document (BRD)',
  'The client''s business context and their own stated requirements, with an honest quality classification for each.',
  '[
    {"key":"business_context","title":"Business Context","dataSource":"client_profile","required":true},
    {"key":"requirements","title":"Business Requirements","dataSource":"business_requirements","required":true}
  ]'::jsonb,
  true
)
ON CONFLICT (document_type, version) DO NOTHING;

INSERT INTO document_templates (document_type, name, description, sections, approval_required)
VALUES (
  'gap_analysis_report',
  'Gap Analysis Report',
  'Current vs. target state for every identified gap, its real compliance status, evidence, and recorded decisions.',
  '[
    {"key":"discovery","title":"Discovery Sources","dataSource":"discovery_sources","required":false},
    {"key":"gaps","title":"Gaps Identified","dataSource":"gaps","required":true},
    {"key":"evidence","title":"Evidence","dataSource":"gap_evidence","required":true},
    {"key":"recommendations","title":"Recommendations & Decisions","dataSource":"gap_options_decisions","required":true},
    {"key":"transformations","title":"Planned Transformations","dataSource":"transformations","required":false}
  ]'::jsonb,
  true
)
ON CONFLICT (document_type, version) DO NOTHING;

INSERT INTO document_templates (document_type, name, description, sections, approval_required)
VALUES (
  'current_state_assessment',
  'Current State Assessment Report',
  'Real, evidence-based assessment findings across every current-state domain (Infrastructure, Business, Application, Data, Security, Quality, Operations).',
  '[
    {"key":"assessments","title":"Assessment Findings by Domain","dataSource":"assessments","required":true}
  ]'::jsonb,
  false
)
ON CONFLICT (document_type, version) DO NOTHING;
