-- Migration 005: Merchant Portal + Inventory + Pricing Console
BEGIN;

-- Merchant settings (shipping, payment, business hours)
CREATE TABLE merchant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
  shipping_config JSONB DEFAULT '{}',
  payment_config JSONB DEFAULT '{}',
  business_hours JSONB DEFAULT '{}',
  return_policy TEXT,
  tax_config JSONB DEFAULT '{}',
  notification_preferences JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id)
);

-- Merchant subscription (plan management)
CREATE TABLE merchant_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free','basic','professional','enterprise')),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','past_due','cancelled','expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  features JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_merchant_sub ON merchant_subscription (merchant_id, status);

-- Inventory
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES item_variant(id),
  merchant_id UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
  warehouse VARCHAR(255) DEFAULT 'default',
  location VARCHAR(255),
  quantity INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  low_stock_threshold INT DEFAULT 5,
  status VARCHAR(30) NOT NULL DEFAULT 'in_stock'
    CHECK (status IN ('in_stock','low_stock','out_of_stock','discontinued')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, variant_id, merchant_id, warehouse)
);
CREATE INDEX idx_inventory_merchant ON inventory (merchant_id, status);
CREATE INDEX idx_inventory_item ON inventory (item_id);

-- Inventory history
CREATE TABLE inventory_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  change_type VARCHAR(30) NOT NULL
    CHECK (change_type IN ('restock','sale','return','adjustment','reservation','release')),
  quantity_change INT NOT NULL,
  quantity_after INT NOT NULL,
  reason TEXT,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_inv_history ON inventory_history (inventory_id, created_at DESC);

-- Price rules (bulk pricing, regional, tax)
CREATE TABLE price_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchant(id),
  item_id UUID REFERENCES item(id),
  category_id UUID REFERENCES category(id),
  rule_type VARCHAR(30) NOT NULL
    CHECK (rule_type IN ('discount','tax','shipping','regional','bulk','dynamic')),
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  priority INT DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_price_rule ON price_rule (merchant_id, active);

-- Campaigns (scheduled promotions)
CREATE TABLE campaign (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchant(id),
  tenant_id VARCHAR(255) NOT NULL DEFAULT 'public',
  name VARCHAR(255) NOT NULL,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('flash_sale','seasonal','clearance','launch','referral','loyalty')),
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','active','ended','cancelled')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  item_ids UUID[] DEFAULT '{}',
  category_ids UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_status ON campaign (status, starts_at);
CREATE INDEX idx_campaign_merchant ON campaign (merchant_id);

COMMIT;
