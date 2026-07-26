-- Migration 003: Merchant & Brand Enterprise Module
BEGIN;

-- Extend brand with enterprise fields
ALTER TABLE brand ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);
ALTER TABLE brand ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';
ALTER TABLE brand ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE brand ADD COLUMN IF NOT EXISTS categories UUID[] DEFAULT '{}';
ALTER TABLE brand ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active','archived'));
ALTER TABLE brand ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]';
ALTER TABLE brand ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Merchant extended fields
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100);
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100);
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS business_type VARCHAR(50);
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS founded_year INT;
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS employee_count VARCHAR(30);
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS annual_revenue VARCHAR(30);
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS policies JSONB DEFAULT '{}';
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS certifications TEXT[] DEFAULT '{}';
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE merchant ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Merchant verification
CREATE TABLE merchant_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
  level VARCHAR(30) NOT NULL DEFAULT 'basic'
    CHECK (level IN ('basic','verified','premium','enterprise')),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_review','approved','rejected','expired')),
  documents JSONB DEFAULT '[]',
  reviewer_id UUID,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_merchant_verif ON merchant_verification (merchant_id, status);

-- Merchant branches/locations
CREATE TABLE merchant_branch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address_line1 VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20),
  phone VARCHAR(50),
  email VARCHAR(255),
  is_headquarters BOOLEAN DEFAULT FALSE,
  business_hours JSONB DEFAULT '{}',
  status VARCHAR(30) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_merchant_branch ON merchant_branch (merchant_id);

-- Merchant contacts
CREATE TABLE merchant_contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_merchant_contact ON merchant_contact (merchant_id);

-- Merchant category mapping
CREATE TABLE merchant_category (
  merchant_id UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES category(id) ON DELETE CASCADE,
  PRIMARY KEY (merchant_id, category_id)
);

COMMIT;
