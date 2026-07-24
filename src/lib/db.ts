import Database from "libsql";
import path from "path";
import fs from "fs";
import { hashPassword } from "./hash";
import { seed } from "./seed";

/** The libsql connection type (API-compatible with better-sqlite3). */
export type DbConn = InstanceType<typeof Database>;

declare global {
  // eslint-disable-next-line no-var
  var __hoshiDb: DbConn | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','MANAGER','CASHIER','INVENTORY','ACCOUNTANT')),
  active INTEGER NOT NULL DEFAULT 1,
  avatar TEXT,
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

CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,   -- YYYY-MM-DD (local)
  count INTEGER NOT NULL DEFAULT 0
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
function migrate(db: DbConn) {
  const cols = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  // Loyalty system removed: drop tier / points / store_credit if present.
  const customerCols = cols("customers");
  for (const dead of ["tier", "points", "store_credit"]) {
    if (customerCols.includes(dead)) db.exec(`ALTER TABLE customers DROP COLUMN ${dead}`);
  }
  // Columns added after the initial schema — add if an older DB predates them.
  if (!cols("users").includes("avatar")) db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT`);
  const productCols = cols("products");
  if (!productCols.includes("image")) db.exec(`ALTER TABLE products ADD COLUMN image TEXT`);
  if (!productCols.includes("notes")) db.exec(`ALTER TABLE products ADD COLUMN notes TEXT`);
  if (!productCols.includes("market_price")) db.exec(`ALTER TABLE products ADD COLUMN market_price INTEGER`);
}

export function getDb(): DbConn {
  if (global.__hoshiDb) return global.__hoshiDb;
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  let db: DbConn;
  if (url) {
    // Production (free host): Turso embedded replica. Reads are local & fast; writes
    // forward to the cloud primary (durable), and read-your-writes keeps this copy
    // current — so the app behaves exactly like a local SQLite file, but the data
    // lives safely in Turso and survives the host wiping its disk.
    // (authToken/readYourWrites are supported at runtime but missing from the .d.ts.)
    const opts = { syncUrl: url, authToken, readYourWrites: true };
    db = new Database(path.join(dir, "replica.db"), opts);
    try { db.sync(); } catch { /* first boot / transient — schema below still creates it */ }
  } else {
    // Local dev: a plain on-disk SQLite file.
    db = new Database(path.join(dir, "hoshihits.db"));
    try { db.pragma("journal_mode = WAL"); } catch { /* backend-dependent */ }
  }
  try { db.pragma("foreign_keys = ON"); } catch { /* Turso enforces separately */ }

  db.exec(SCHEMA);
  migrate(db);

  // One-time migration: copy a legacy on-disk SQLite database into Turso. Runs
  // only when MIGRATE_LOCAL_TO_TURSO=1, Turso is the backend, and Turso is still
  // empty — so it's a safe no-op everywhere except the single boot where we cut
  // over. Both databases are reachable from inside the old host's container.
  if (url && process.env.MIGRATE_LOCAL_TO_TURSO === "1") {
    try { migrateLocalToTurso(db, dir); } catch (e) { console.error("[migrate→turso]", e); }
  }

  // Demo data is opt-in only. In production an empty database triggers the
  // first-run owner setup instead of inventing accounts.
  if (process.env.SEED_DEMO === "1") {
    const hasUsers = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
    if (hasUsers.c === 0) seed(db, hashPassword, ts);
  }
  normalizeColumnCase(db);
  global.__hoshiDb = db;
  return db;
}

/**
 * libsql returns SQL reserved-word columns UPPERCASED (`action` -> `ACTION`,
 * `key` -> `KEY`), unlike better-sqlite3 which preserves the declared case. That
 * silently turns `row.action` into undefined. Every alias in this codebase is
 * lower-case, so lower-casing result keys once here makes all queries behave
 * exactly as they did before — instead of patching each call site.
 */
function normalizeColumnCase(db: DbConn) {
  const lower = <T,>(row: T): T => {
    if (!row || typeof row !== "object") return row;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      const key = k.toLowerCase();
      // Never let a normalised key clobber one the driver already gave us.
      if (key === k || !(key in (row as Record<string, unknown>))) out[key] = v;
    }
    return out as T;
  };

  const prepare = db.prepare.bind(db);
  (db as unknown as { prepare: (sql: string) => unknown }).prepare = (sql: string) => {
    const stmt = prepare(sql) as {
      get: (...a: unknown[]) => unknown;
      all: (...a: unknown[]) => unknown[];
    };
    const get = stmt.get.bind(stmt);
    const all = stmt.all.bind(stmt);
    stmt.get = (...a: unknown[]) => lower(get(...a));
    stmt.all = (...a: unknown[]) => all(...a).map(lower);
    return stmt;
  };
}

/** Copy every row from the legacy local SQLite file into Turso (once). */
function migrateLocalToTurso(turso: DbConn, dir: string) {
  const legacyPath = path.join(dir, "hoshihits.db");
  if (!fs.existsSync(legacyPath)) { console.log("[migrate→turso] no legacy DB, skipping"); return; }
  const tursoUsers = (turso.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  if (tursoUsers > 0) { console.log("[migrate→turso] Turso already has data, skipping"); return; }

  const local = new Database(legacyPath);
  const localUsers = (local.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  if (localUsers === 0) { console.log("[migrate→turso] legacy DB empty, skipping"); local.close(); return; }

  // Dependency order so foreign keys resolve.
  const TABLES = [
    "users", "customers", "suppliers", "products", "settings", "ai_usage",
    "sales", "sale_items", "preorders", "purchase_orders", "po_items", "shipments",
    "tradeins", "tradein_items", "expenses", "tournaments", "audit_log",
  ];
  for (const table of TABLES) {
    let rows: Record<string, unknown>[] = [];
    try { rows = local.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]; }
    catch { continue; } // table may not exist in an older legacy DB
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]).filter((c) => c !== "_metadata");
    const ins = turso.prepare(
      `INSERT OR IGNORE INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`
    );
    let n = 0;
    for (const row of rows) { ins.run(...cols.map((c) => row[c] as never)); n++; }
    console.log(`[migrate→turso] ${table}: copied ${n} rows`);
  }
  local.close();
  try { turso.sync(); } catch { /* best effort push */ }
  console.log("[migrate→turso] DONE");
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

export interface AiUsage { used: number; limit: number }

/** Count one AI photo scan against today's quota. */
export function recordAiScan(): void {
  getDb()
    .prepare("INSERT INTO ai_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1")
    .run(today());
}

/** Today's AI scan count and the configured daily limit (resets each day). */
export function getAiUsage(): AiUsage {
  const db = getDb();
  const row = db.prepare("SELECT count FROM ai_usage WHERE day = ?").get(today()) as { count: number } | undefined;
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'ai_daily_limit'").get() as { value: string } | undefined;
  const limit = Math.max(1, Number(setting?.value) || Number(process.env.GEMINI_DAILY_LIMIT) || 200);
  return { used: row?.count ?? 0, limit };
}

let counterStmtReady = false;
/** Sequential document numbers like S-000123, PO-0007 */
export function nextNumber(prefix: string, table: string, pad = 5): string {
  const db = getDb();
  if (!counterStmtReady) counterStmtReady = true;
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return `${prefix}-${String(row.c + 1).padStart(pad, "0")}`;
}
