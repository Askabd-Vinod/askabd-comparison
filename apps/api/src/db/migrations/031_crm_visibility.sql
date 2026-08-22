-- Real CRM customer-visibility split, found necessary during a completeness pass:
-- staff previously had no way to mark a note/task/contact as safe for a customer to
-- see, so ALL CRM data was staff-only by construction. Adds an explicit visibility
-- field, defaulting to 'internal' — an item is only ever customer-visible if a real
-- staff member explicitly marks it so; nothing is exposed by default.
ALTER TABLE oc_client_notes ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal'
  CHECK (visibility IN ('internal', 'customer'));
ALTER TABLE oc_client_tasks ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal'
  CHECK (visibility IN ('internal', 'customer'));
ALTER TABLE oc_contacts ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal'
  CHECK (visibility IN ('internal', 'customer'));
