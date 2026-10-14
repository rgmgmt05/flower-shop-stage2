-- Stage 2 demo. 1店舗・SKU合計在庫。SQLite / Cloudflare D1。
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  icon TEXT NOT NULL DEFAULT '✿',
  tone TEXT NOT NULL DEFAULT 'white',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS wraps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  icon TEXT NOT NULL DEFAULT '◌'
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  pickup TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','producing','done','canceled')),
  payment TEXT NOT NULL DEFAULT 'SIMULATED',
  total INTEGER NOT NULL CHECK (total >= 0),
  lines_json TEXT NOT NULL,
  snapshots_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_demand (
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY(order_id, product_id)
);
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  delta INTEGER NOT NULL CHECK (delta != 0),
  reason TEXT NOT NULL,
  unit_cost INTEGER CHECK (unit_cost IS NULL OR unit_cost >= 0),
  order_id TEXT REFERENCES orders(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS prevent_inactive_sale
BEFORE UPDATE OF stock ON products
WHEN NEW.stock < OLD.stock AND OLD.active = 0
BEGIN SELECT RAISE(ABORT, 'SALE_DISABLED'); END;
-- Cancellation returns stock EXACTLY ONCE, regardless of repeated/concurrent API calls.
CREATE TRIGGER IF NOT EXISTS restock_canceled_order
AFTER UPDATE OF status ON orders
WHEN NEW.status = 'canceled' AND OLD.status != 'canceled'
BEGIN
  UPDATE products
  SET stock = stock + (SELECT qty FROM order_demand WHERE order_id = NEW.id AND product_id = products.id)
  WHERE id IN (SELECT product_id FROM order_demand WHERE order_id = NEW.id);
  INSERT INTO movements(product_id, delta, reason, unit_cost, order_id)
  SELECT product_id, qty, 'ECテスト注文取消', NULL, NEW.id
  FROM order_demand WHERE order_id = NEW.id;
END;
CREATE INDEX IF NOT EXISTS idx_movements_recent ON movements(id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_recent ON orders(created_at DESC);

INSERT OR IGNORE INTO products(id,name,type,price,stock,icon,tone) VALUES
('rose-r','赤バラ 60cm','バラ・赤',350,18,'🌹','coral'),
('rose-w','白バラ 50cm','バラ・白',320,15,'🤍','white'),
('tulip','チューリップ','春の花',280,12,'🌷','coral'),
('gerbera','ガーベラ','切り花',220,20,'🌼','yellow'),
('lilac','スターチス','枝もの・小花',180,14,'🪻','lilac'),
('green','ユーカリ','グリーン',180,22,'🌿','white');
INSERT OR IGNORE INTO wraps(id,name,price,icon) VALUES
('natural','クラフト',200,'◌'),('white','ホワイト',300,'○'),('pink','ピンク',350,'✿');
