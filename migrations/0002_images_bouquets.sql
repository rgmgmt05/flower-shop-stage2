-- Photos live in R2; only stable media IDs are stored in D1.
ALTER TABLE products ADD COLUMN image_id TEXT;
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  byte_count INTEGER NOT NULL CHECK (byte_count > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bouquet_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image_id TEXT REFERENCES media(id),
  parts_json TEXT NOT NULL,
  wrap_id TEXT NOT NULL REFERENCES wraps(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bouquet_templates_recent ON bouquet_templates(created_at DESC);
