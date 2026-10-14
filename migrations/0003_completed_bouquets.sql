-- Link finished bouquet examples to their originating order lines.
-- Manually registered shop/phone bouquets keep NULL source IDs.
ALTER TABLE bouquet_templates ADD COLUMN source_order_id TEXT REFERENCES orders(id);
ALTER TABLE bouquet_templates ADD COLUMN source_line_index INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bouquet_template_order_line
  ON bouquet_templates(source_order_id,source_line_index)
  WHERE source_order_id IS NOT NULL;
