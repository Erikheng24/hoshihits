import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { hashPassword } from "./hash";
import { seed } from "./seed";

declare global {
  // eslint-disable-next-line no-var
  var __hoshiDb: Database.Database | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','MANAGER','CASHIER','INVENTORY','ACCOUNTANT')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT,
  name TEXT NOT NULL,
  game TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sealed','single','graded','accessory')),
  set_name TEXT,
  rarity TEXT,
  condition TEXT,
  language TEXT DEFAULT 'EN',
  foil INTEGER DEFAULT 0,
  grade_company TEXT,
  grade TEXT,
  cert_number TEXT,
  image TEXT,                      -- scanned/cropped photo as a data URL
  notes TEXT,
  market_price INTEGER,            -- reference market estimate, cents
  price INTEGER NOT NULL,          -- cents
  cost INTEGER NOT NULL DEFAULT 0, -- cents
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock INTEGER NOT NULL DEFAULT 4,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_game ON products(game);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  user_id INTEGER REFERENCES users(id),
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  cost_total INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  change_due INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE IF NOT EXISTS preorders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  game TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  deposit INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','arrived','ready','collected','cancelled')),
  expected_date TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  games TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','in_transit','received','cancelled')),
  expected_date TEXT,
  shipping_cost INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS po_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  received_qty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL,
  po_id INTEGER REFERENCES purchase_orders(id),
  carrier TEXT,
  tracking TEXT,
  origin TEXT,
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('processing','in_transit','customs','arrived','received')),
  eta TEXT,
  received_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tradeins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  kind TEXT NOT NULL CHECK (kind IN ('buylist','tradein')),
  payout_method TEXT NOT NULL DEFAULT 'cash',
  total INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tradein_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tradein_id INTEGER NOT NULL REFERENCES tradeins(id),
  name TEXT NOT NULL,
  game TEXT,
  condition TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL, -- cents
  date TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  game TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  entry_fee INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 16,
  registered INTEGER NOT NULL DEFAULT 0,
  prize TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','completed','cancelled')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

/** Local-time timestamp "YYYY-MM-DD HH:MM:SS" so SQLite date() works naturally. */
export function ts(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function today(): string {
  return ts().slice(0, 10);
}

/** Idempotent schema migrations for databases seeded by earlier versions. */
function migrate(db: Database.Database) {
  const cols = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  // Loyalty system removed: drop tier / points / store_credit if present.
  const customerCols = cols("customers");
  for (const dead of ["tier", "points", "store_credit"]) {
    if (customerCols.includes(dead)) db.exec(`ALTER TABLE customers DROP COLUMN ${dead}`);
  }
  // Columns added after the initial schema — add if an older DB predates them.
  const productCols = cols("products");
  if (!productCols.includes("image")) db.exec(`ALTER TABLE products ADD COLUMN image TEXT`);
  if (!productCols.includes("notes")) db.exec(`ALTER TABLE products ADD COLUMN notes TEXT`);
  if (!productCols.includes("market_price")) db.exec(`ALTER TABLE products ADD COLUMN market_price INTEGER`);
}

export function getDb(): Database.Database {
  if (global.__hoshiDb) return global.__hoshiDb;
  // DATA_DIR lets the host mount a persistent volume (Railway etc.); falls back to ./data locally.
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "hoshihits.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  // Demo data is opt-in only. In production an empty database triggers the
  // first-run owner setup instead of inventing accounts.
  if (process.env.SEED_DEMO === "1") {
    const hasUsers = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
    if (hasUsers.c === 0) seed(db, hashPassword, ts);
  }
  global.__hoshiDb = db;
  return db;
}

/** True when no account exists yet — the app is awaiting first-run setup. */
export function needsSetup(): boolean {
  return (getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c === 0;
}

export function audit(userId: number | null, action: string, entity?: string, entityId?: number, details?: string) {
  getDb()
    .prepare("INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?,?,?,?,?,?)")
    .run(userId, action, entity ?? null, entityId ?? null, details ?? null, ts());
}

let counterStmtReady = false;
/** Sequential document numbers like S-000123, PO-0007 */
export function nextNumber(prefix: string, table: string, pad = 5): string {
  const db = getDb();
  if (!counterStmtReady) counterStmtReady = true;
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return `${prefix}-${String(row.c + 1).padStart(pad, "0")}`;
}
