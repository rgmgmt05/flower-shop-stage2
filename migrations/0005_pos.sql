-- Stage 3C: store-front POS and administration share the same inventory.
CREATE TABLE IF NOT EXISTS pos_sales(
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  staff_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','external')),
  payment_status TEXT NOT NULL DEFAULT 'confirmed' CHECK(payment_status='confirmed'),
  total INTEGER NOT NULL CHECK(total >= 0),
  lines_json TEXT NOT NULL,
  demand_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_recent ON pos_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_staff ON pos_sales(staff_id,created_at DESC);
ALTER TABLE movements ADD COLUMN pos_sale_id TEXT REFERENCES pos_sales(id);
CREATE INDEX IF NOT EXISTS idx_movements_pos_sale ON movements(pos_sale_id);
