-- Migration 004: Universal Product Catalog
BEGIN;

-- Item media (normalized from JSONB to table for querying)
CREATE TABLE item_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('image','video','document','3d')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  alt_text VARCHAR(500),
  caption TEXT,
  sort_order INT DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_item_media ON item_media (item_id, type, sort_order);

-- Related items (bidirectional)
CREATE TABLE item_relation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  related_item_id UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  relation_type VARCHAR(30) NOT NULL DEFAULT 'similar'
    CHECK (relation_type IN ('similar','alternative','accessory','upgrade','bundle','complementary')),
  sort_order INT DEFAULT 0,
  UNIQUE (item_id, related_item_id, relation_type)
);
CREATE INDEX idx_item_relation ON item_relation (item_id, relation_type);

-- Extend item with published_at and sourcing
ALTER TABLE item ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE item ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';
ALTER TABLE item ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE item ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'en';

COMMIT;
