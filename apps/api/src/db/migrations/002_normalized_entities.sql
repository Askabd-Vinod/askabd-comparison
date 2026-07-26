-- Migration 002: Normalized schema per Architecture Blueprint
-- Adds: comparison_template, comparison_attribute, item_variant, item_price, brand, merchant, offer, search_history

BEGIN;

-- Comparison Templates (domain-agnostic attribute definitions)
CREATE TABLE comparison_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES category(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  attribute_groups JSONB NOT NULL DEFAULT '[]',
  layout_config JSONB DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_template_category ON comparison_template (category_id);

CREATE TABLE comparison_attribute (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES comparison_template(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  data_type VARCHAR(30) NOT NULL DEFAULT 'text'
    CHECK (data_type IN ('text','number','boolean','date','enum','url','currency','rating')),
  unit VARCHAR(50),
  options JSONB DEFAULT '[]',
  is_comparable BOOLEAN NOT NULL DEFAULT TRUE,
  is_filterable BOOLEAN NOT NULL DEFAULT FALSE,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT DEFAULT 0,
  group_name VARCHAR(100),
  weight DECIMAL(3,2) DEFAULT 1.0
);
CREATE INDEX idx_attr_template ON comparison_attribute (template_id, display_order);

-- Brand
CREATE TABLE brand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  logo_url TEXT,
  description TEXT,
  website TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merchant
CREATE TABLE merchant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL DEFAULT 'public',
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  logo_url TEXT,
  website TEXT,
  affiliate_config JSONB DEFAULT '{}',
  trust_score DECIMAL(3,2) DEFAULT 0,
  commission_rate DECIMAL(5,4) DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX idx_merchant_status ON merchant (status);

-- Add brand_id and merchant_id to item
ALTER TABLE item ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brand(id);
ALTER TABLE item ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchant(id);

-- Item Variant (color, size, storage, etc.)
CREATE TABLE item_variant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  specifications JSONB DEFAULT '{}',
  price_current BIGINT,
  price_original BIGINT,
  currency VARCHAR(3) DEFAULT 'USD',
  availability VARCHAR(30) DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_variant_item ON item_variant (item_id);

-- Price History (per item per merchant)
CREATE TABLE item_price (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES item_variant(id),
  merchant_id UUID REFERENCES merchant(id),
  price BIGINT NOT NULL,
  original_price BIGINT,
  currency VARCHAR(3) DEFAULT 'USD',
  source_url TEXT,
  is_affiliate BOOLEAN DEFAULT FALSE,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_price_item ON item_price (item_id, recorded_at DESC);
CREATE INDEX idx_price_merchant ON item_price (merchant_id);

-- Offer
CREATE TABLE offer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES item(id),
  merchant_id UUID REFERENCES merchant(id),
  type VARCHAR(30) NOT NULL CHECK (type IN ('discount','coupon','bundle','cashback','freebie')),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  code VARCHAR(100),
  discount_value DECIMAL(10,2),
  discount_type VARCHAR(20) CHECK (discount_type IN ('percent','fixed')),
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  terms TEXT,
  url TEXT,
  priority INT DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_offer_item ON offer (item_id, status);
CREATE INDEX idx_offer_merchant ON offer (merchant_id, status);

-- Search History
CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  query VARCHAR(500) NOT NULL,
  category_id UUID REFERENCES category(id),
  filters JSONB DEFAULT '{}',
  results_count INT DEFAULT 0,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_search_user ON search_history (user_id, searched_at DESC);

COMMIT;
