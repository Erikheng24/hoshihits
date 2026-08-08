import { hashPassword } from "./hash";

/** Demo/sandbox mode — set DEMO=1 on the demo deployment (which uses a local,
 *  isolated SQLite DB, so it never touches the real shop). */
export const IS_DEMO = process.env.DEMO === "1";

export const DEMO_EMAIL = "demo@hoshihits.com";

type Db = {
  prepare(sql: string): { run(...a: unknown[]): unknown; get(...a: unknown[]): unknown };
};

function nowStr(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// [name, game, category, set_name, rarity, condition, grade_company, grade, cert, priceCents, costCents, stock]
type P = [string, string, string, string | null, string | null, string | null, string | null, string | null, string | null, number, number, number];
const PRODUCTS: P[] = [
  ["Charizard ex", "Pokémon", "single", "Obsidian Flames", "SIR", "NM", null, null, null, 8900, 5200, 3],
  ["Pikachu ex", "Pokémon", "single", "Surging Sparks", "SAR", "NM", null, null, null, 6500, 3800, 4],
  ["Mewtwo VSTAR", "Pokémon", "single", "Pokémon GO", "SAR", "NM", null, null, null, 3200, 1800, 6],
  ["Charizard", "Pokémon", "graded", "Base Set", null, null, "PSA", "9", "72651134", 149000, 90000, 1],
  ["Umbreon VMAX", "Pokémon", "graded", "Evolving Skies", null, null, "PSA", "10", "84120097", 245000, 160000, 1],
  ["Surging Sparks Booster Box", "Pokémon", "sealed", "Surging Sparks", null, null, null, null, null, 12900, 9500, 8],
  ["Prismatic Evolutions ETB", "Pokémon", "sealed", "Prismatic Evolutions", null, null, null, null, null, 6900, 4800, 10],
  ["Monkey D. Luffy (Leader)", "One Piece", "single", "Romance Dawn", "L", "NM", null, null, null, 4200, 2500, 5],
  ["Roronoa Zoro", "One Piece", "single", "Paramount War", "SR", "NM", null, null, null, 2800, 1500, 7],
  ["Shanks", "One Piece", "graded", "Kingdoms of Intrigue", null, null, "PSA", "10", "83994210", 180000, 120000, 1],
  ["OP-08 Two Legends Booster Box", "One Piece", "sealed", "Two Legends", null, null, null, null, null, 10900, 8200, 6],
  ["Ultra Pro Sleeves (100ct)", "Accessories", "accessory", null, null, null, null, null, null, 500, 250, 40],
  ["Toploaders (25ct)", "Accessories", "accessory", null, null, null, null, null, null, 800, 400, 30],
  ["Card Storage Box", "Accessories", "accessory", null, null, null, null, null, null, 1500, 800, 15],
];

const CUSTOMERS: [string, string][] = [
  ["Sok Dara", "012 345 678"],
  ["Chan Vann", "011 222 333"],
  ["Ny Sophea", "070 888 999"],
  ["Kim Rithy", "093 456 789"],
];

const SETTINGS: [string, string][] = [
  ["store_name", "HoshiHits Demo"],
  ["store_tagline", "Collect • Trade • Chase"],
  ["store_address", "Phnom Penh, Cambodia"],
  ["store_phone", "086 294 739"],
  ["shop_welcome", "Welcome to the HoshiHits demo shop — browse real-feeling stock and try placing an order."],
  ["receipt_footer", "Thank you — HoshiHits Demo"],
];

const CODE: Record<string, string> = {
  "Pokémon": "PKM", "One Piece": "OPC", "Yu-Gi-Oh!": "YGO", Accessories: "ACC",
};

/** Seed realistic sample data into a fresh DEMO database (runs once, when empty). */
export function seedDemo(db: Db): void {
  const users = (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
  if (users > 0) return; // already seeded

  // Demo owner (login via the "Try the demo" button — no password needed).
  db.prepare("INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?,?,?,'OWNER',1,?)")
    .run("Demo Owner", DEMO_EMAIL, hashPassword("demo-" + Math.random().toString(36).slice(2)), nowStr());

  const sset = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)");
  for (const [k, v] of SETTINGS) sset.run(k, v);

  const insP = db.prepare(
    `INSERT INTO products (sku, barcode, name, game, category, set_name, rarity, condition, language, foil,
       grade_company, grade, cert_number, image, notes, market_price, price, cost, stock, low_stock, active, created_at)
     VALUES (?,?,?,?,?,?,?,?, 'EN', 0, ?,?,?, NULL, NULL, NULL, ?,?,?,?, 1, ?)`
  );
  let n = 1;
  for (const p of PRODUCTS) {
    const [name, game, category, set_name, rarity, condition, gc, grade, cert, price, cost, stock] = p;
    const sku = `${CODE[game] ?? "GEN"}-${String(n++).padStart(4, "0")}`;
    insP.run(sku, null, name, game, category, set_name, rarity, condition, gc, grade, cert,
      price, price, cost, stock, category === "graded" ? 0 : 2, nowStr(30));
  }

  const insC = db.prepare("INSERT INTO customers (name, phone, created_at) VALUES (?,?,?)");
  for (const [name, phone] of CUSTOMERS) insC.run(name, phone, nowStr(20));
}
