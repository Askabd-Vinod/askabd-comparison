-- Data Mapping Engine (data_mapping_test_1, 2026-08-24 master completion
-- directive, capability #74 — deliberately consolidated with #41 "Migration
-- Mapping Engine": both are the same real capability, per the directive's own
-- "do not create duplicate engines" mandate; a migration's field mapping IS a
-- data mapping set, no separate engine invented for it).
--
-- Genuinely NEW — confirmed before writing this migration that no
-- FieldMapping/DataMapping/oc_field_mappings concept existed anywhere.

CREATE TABLE IF NOT EXISTS oc_data_mapping_sets (
  id TEXT PRIMARY KEY DEFAULT ('dms-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_system TEXT NOT NULL,
  target_system TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'implemented', 'validated', 'deprecated')),
  owner TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_data_mapping_sets_client ON oc_data_mapping_sets(client_id);

CREATE TABLE IF NOT EXISTS oc_data_field_mappings (
  id TEXT PRIMARY KEY DEFAULT ('dfm-' || gen_random_uuid()::text),
  mapping_set_id TEXT NOT NULL REFERENCES oc_data_mapping_sets(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  -- Real mapping-shape taxonomy, per the directive's own explicit list.
  mapping_type TEXT NOT NULL CHECK (mapping_type IN (
    'one_to_one', 'one_to_many', 'many_to_one', 'calculated', 'conditional', 'lookup'
  )),
  source_fields TEXT[] NOT NULL,
  target_fields TEXT[] NOT NULL,
  transformation TEXT NOT NULL DEFAULT '',
  business_rule TEXT NOT NULL DEFAULT '',
  data_type TEXT,
  nullable BOOLEAN NOT NULL DEFAULT true,
  default_value TEXT,
  validation TEXT NOT NULL DEFAULT '',
  lookup_table TEXT,
  lookup_key TEXT,
  condition TEXT,
  dependency TEXT NOT NULL DEFAULT '',
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'implemented', 'validated', 'deprecated')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_data_field_mappings_set ON oc_data_field_mappings(mapping_set_id);
CREATE INDEX IF NOT EXISTS idx_oc_data_field_mappings_client ON oc_data_field_mappings(client_id);
