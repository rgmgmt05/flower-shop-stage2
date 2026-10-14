-- Stage 3A: demo identity model. This is not a production identity service.
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('customer','staff')),
 salt TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 session_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_account ON auth_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES accounts(id);
ALTER TABLE orders ADD COLUMN fulfillment_method TEXT NOT NULL DEFAULT 'pickup' CHECK(fulfillment_method IN ('pickup'));
ALTER TABLE orders ADD COLUMN handed_over_at TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id,created_at DESC);
