BEGIN;

-- Categories (domains: products, travel, insurance, education, etc.)
CREATE TABLE category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL DEFAULT 'public',
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES category(id),
  icon VARCHAR(100),
  description TEXT,
  comparison_template JSONB DEFAULT '[]',
  sort_order INT DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX idx_cat_tenant ON category (tenant_id, active);
CREATE INDEX idx_cat_parent ON category (parent_id);

-- Items (anything that can be compared)
CREATE TABLE item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL DEFAULT 'public',
  category_id UUID NOT NULL REFERENCES category(id),
  name VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  brand VARCHAR(255),
  description TEXT,
  images JSONB DEFAULT '[]',
  videos JSONB DEFAULT '[]',
  specifications JSONB DEFAULT '{}',
  pros TEXT[] DEFAULT '{}',
  cons TEXT[] DEFAULT '{}',
  rating DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  price_current BIGINT,
  price_original BIGINT,
  price_currency VARCHAR(3) DEFAULT 'USD',
  price_history JSONB DEFAULT '[]',
  availability VARCHAR(30) DEFAULT 'available',
  merchant VARCHAR(255),
  merchant_url TEXT,
  offers JSONB DEFAULT '[]',
  warranty TEXT,
  delivery_info JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','draft','archived')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX idx_item_category ON item (category_id, status);
CREATE INDEX idx_item_tenant ON item (tenant_id, status);
CREATE INDEX idx_item_brand ON item (brand);
CREATE INDEX idx_item_tags ON item USING GIN (tags);
CREATE INDEX idx_item_price ON item (price_current);
CREATE INDEX idx_item_rating ON item (rating DESC);

-- Comparisons (saved user comparisons)
CREATE TABLE comparison (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL DEFAULT 'public',
  user_id UUID NOT NULL,
  title VARCHAR(500),
  category_id UUID REFERENCES category(id),
  item_ids UUID[] NOT NULL DEFAULT '{}',
  notes TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  share_token VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comparison_user ON comparison (user_id);
CREATE INDEX idx_comparison_share ON comparison (share_token);

-- Wishlist
CREATE TABLE wishlist_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES item(id),
  notes TEXT,
  price_alert_threshold BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, item_id)
);
CREATE INDEX idx_wishlist_user ON wishlist_item (user_id);

-- Reviews
CREATE TABLE review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES item(id),
  user_id UUID NOT NULL,
  rating DECIMAL(3,2) NOT NULL CHECK (rating >= 0 AND rating <= 5),
  title VARCHAR(500),
  content TEXT,
  pros TEXT[] DEFAULT '{}',
  cons TEXT[] DEFAULT '{}',
  verified_purchase BOOLEAN DEFAULT FALSE,
  helpful_count INT DEFAULT 0,
  status VARCHAR(30) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_review_item ON review (item_id, status);
CREATE INDEX idx_review_user ON review (user_id);

COMMIT;
