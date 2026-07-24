import type LibsqlDatabase from "libsql";

type Database = InstanceType<typeof LibsqlDatabase>;

type Hash = (p: string) => string;
type Ts = (d?: Date) => string;

// Deterministic PRNG so the seeded store looks the same on every machine.
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seed(db: Database, hash: Hash, ts: Ts) {
  const rnd = mulberry32(777);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const ri = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

  const now = new Date();
  const daysAgo = (n: number, h = 12, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    d.setHours(h, m, ri(0, 59), 0);
    return d;
  };

  // ---- Users -------------------------------------------------------------
  const insUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?,?,?,?,1,?)"
  );
  const users = [
    ["Sokheng Sorm", "owner@hoshihits.com", "OWNER"],
    ["Dara Kim", "manager@hoshihits.com", "MANAGER"],
    ["Nika Chan", "cashier@hoshihits.com", "CASHIER"],
    ["Piseth Rith", "inventory@hoshihits.com", "INVENTORY"],
    ["Maly Sok", "accountant@hoshihits.com", "ACCOUNTANT"],
  ] as const;
  for (const [name, email, role] of users) {
    insUser.run(name, email, hash("hoshi123"), role, ts(daysAgo(200)));
  }

  // ---- Products ----------------------------------------------------------
  const insProduct = db.prepare(
    `INSERT INTO products (sku, barcode, name, game, category, set_name, rarity, condition, language, foil,
      grade_company, grade, cert_number, price, cost, stock, low_stock, active, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`
  );

  let skuSeq = 1;
  const sku = (g: string) => `${g}-${String(skuSeq++).padStart(4, "0")}`;
  const bc = () => String(4900000000000 + Math.floor(rnd() * 99999999999));

  type P = {
    name: string; game: string; category: "sealed" | "single" | "graded" | "accessory";
    set?: string; rarity?: string; cond?: string; lang?: string; foil?: number;
    gc?: string; grade?: string; price: number; cost: number; stock: number; low?: number;
  };

  const P: P[] = [
    // Pokémon sealed
    { name: "Surging Sparks Booster Box", game: "Pokémon", category: "sealed", set: "Surging Sparks", price: 15999, cost: 11800, stock: 14 },
    { name: "Prismatic Evolutions ETB", game: "Pokémon", category: "sealed", set: "Prismatic Evolutions", price: 8999, cost: 6200, stock: 6, low: 3 },
    { name: "151 Booster Bundle", game: "Pokémon", category: "sealed", set: "Scarlet & Violet 151", price: 3499, cost: 2500, stock: 22 },
    { name: "Terastal Festival Booster Box (JP)", game: "Pokémon", category: "sealed", set: "Terastal Festival", lang: "JP", price: 8999, cost: 6100, stock: 9 },
    { name: "Crown Zenith Mini Tin", game: "Pokémon", category: "sealed", set: "Crown Zenith", price: 1299, cost: 850, stock: 30 },
    // Pokémon singles
    { name: "Pikachu ex 238/191", game: "Pokémon", category: "single", set: "Surging Sparks", rarity: "SIR", cond: "NM", price: 42500, cost: 30000, stock: 2, low: 1 },
    { name: "Charizard ex 199/165", game: "Pokémon", category: "single", set: "SV 151", rarity: "SIR", cond: "NM", price: 18900, cost: 12500, stock: 3 },
    { name: "Umbreon VMAX Alt Art", game: "Pokémon", category: "single", set: "Evolving Skies", rarity: "SAR", cond: "LP", price: 89900, cost: 65000, stock: 1, low: 1 },
    { name: "Iono 254/193", game: "Pokémon", category: "single", set: "Paldea Evolved", rarity: "SAR", cond: "NM", price: 9800, cost: 6800, stock: 4 },
    { name: "Boss's Orders (Ghetsis) FA", game: "Pokémon", category: "single", set: "Plasma Storm", rarity: "FA", cond: "NM", price: 3500, cost: 2100, stock: 6 },
    // Pokémon graded
    { name: "Charizard VMAX PSA 10", game: "Pokémon", category: "graded", set: "Champion's Path", gc: "PSA", grade: "10", price: 32000, cost: 21000, stock: 1, low: 0 },
    { name: "Moonbreon PSA 9", game: "Pokémon", category: "graded", set: "Evolving Skies", gc: "PSA", grade: "9", price: 62000, cost: 45000, stock: 1, low: 0 },
    { name: "Pikachu Illustrator CGC 8 (Display)", game: "Pokémon", category: "graded", set: "Promo", gc: "CGC", grade: "8", price: 480000, cost: 380000, stock: 1, low: 0 },
    // One Piece
    { name: "OP-09 Emperors in the New World Box", game: "One Piece", category: "sealed", set: "OP-09", price: 11999, cost: 8400, stock: 12 },
    { name: "OP-05 Awakening of the New Era Box", game: "One Piece", category: "sealed", set: "OP-05", price: 24999, cost: 16000, stock: 4, low: 2 },
    { name: "EB-01 Memorial Collection Box", game: "One Piece", category: "sealed", set: "EB-01", price: 13999, cost: 9800, stock: 8 },
    { name: "Shanks OP01-120 SEC Alt Art", game: "One Piece", category: "single", set: "OP-01", rarity: "SEC", cond: "NM", price: 32000, cost: 22000, stock: 2, low: 1 },
    { name: "Luffy OP05-119 SEC Manga", game: "One Piece", category: "single", set: "OP-05", rarity: "SEC", cond: "NM", price: 145000, cost: 105000, stock: 1, low: 0 },
    { name: "Nami OP01-016 SP", game: "One Piece", category: "single", set: "OP-01", rarity: "SP", cond: "NM", price: 8900, cost: 5600, stock: 3 },
    { name: "Boa Hancock ST-04 Leader PSA 10", game: "One Piece", category: "graded", set: "ST-04", gc: "PSA", grade: "10", price: 19500, cost: 12000, stock: 1, low: 0 },
    // Yu-Gi-Oh!
    { name: "Quarter Century Bonanza Box", game: "Yu-Gi-Oh!", category: "sealed", set: "RA03", price: 10999, cost: 7600, stock: 10 },
    { name: "Blue-Eyes White Dragon LOB QCSE", game: "Yu-Gi-Oh!", category: "single", set: "RA02", rarity: "QCSE", cond: "NM", price: 15500, cost: 9800, stock: 2 },
    { name: "Ash Blossom & Joyous Spring UR", game: "Yu-Gi-Oh!", category: "single", set: "RA01", rarity: "UR", cond: "NM", price: 1800, cost: 900, stock: 12 },
    { name: "Dark Magician SDY PSA 8", game: "Yu-Gi-Oh!", category: "graded", set: "SDY", gc: "PSA", grade: "8", price: 24000, cost: 15000, stock: 1, low: 0 },
    // Weiss Schwarz
    { name: "Hololive Vol.2 Premium Booster Box", game: "Weiss Schwarz", category: "sealed", set: "Hololive Vol.2", lang: "JP", price: 8999, cost: 6300, stock: 7 },
    { name: "Oshi no Ko Booster Box", game: "Weiss Schwarz", category: "sealed", set: "Oshi no Ko", lang: "JP", price: 7999, cost: 5400, stock: 5 },
    { name: "Gura Signed SP", game: "Weiss Schwarz", category: "single", set: "Hololive EN", rarity: "SP", cond: "NM", price: 68000, cost: 48000, stock: 1, low: 0 },
    // Union Arena
    { name: "Jujutsu Kaisen Vol.2 Booster Box", game: "Union Arena", category: "sealed", set: "JJK Vol.2", lang: "JP", price: 7499, cost: 5100, stock: 9 },
    { name: "Hunter x Hunter Booster Box", game: "Union Arena", category: "sealed", set: "HxH", lang: "JP", price: 7499, cost: 5100, stock: 6 },
    { name: "Gojo Satoru UA01BT SR★★", game: "Union Arena", category: "single", set: "JJK Vol.1", rarity: "SR**", cond: "NM", price: 12500, cost: 8200, stock: 2 },
    // Magic
    { name: "MH3 Modern Horizons 3 Play Booster Box", game: "Magic", category: "sealed", set: "MH3", price: 27999, cost: 21500, stock: 5, low: 2 },
    { name: "Bloomburrow Collector Booster Box", game: "Magic", category: "sealed", set: "Bloomburrow", price: 23999, cost: 18200, stock: 4 },
    { name: "The One Ring (Borderless)", game: "Magic", category: "single", set: "LTR", rarity: "Mythic", cond: "NM", foil: 1, price: 89000, cost: 62000, stock: 1, low: 0 },
    { name: "Ragavan, Nimble Pilferer", game: "Magic", category: "single", set: "MH2", rarity: "Mythic", cond: "NM", price: 6500, cost: 4200, stock: 5 },
    // Digimon
    { name: "BT-17 Secret Crisis Booster Box", game: "Digimon", category: "sealed", set: "BT-17", price: 8499, cost: 5900, stock: 8 },
    { name: "Omnimon BT1-084 SEC", game: "Digimon", category: "single", set: "BT-01", rarity: "SEC", cond: "NM", price: 5500, cost: 3400, stock: 3 },
    // Dragon Ball
    { name: "Fusion World FB-03 Booster Box", game: "Dragon Ball", category: "sealed", set: "FB-03", price: 8999, cost: 6200, stock: 7 },
    { name: "Goku SSGSS FB01 SCR", game: "Dragon Ball", category: "single", set: "FB-01", rarity: "SCR", cond: "NM", price: 21000, cost: 14500, stock: 1, low: 1 },
    // Gundam
    { name: "Gundam Card Game GD-01 Booster Box", game: "Gundam", category: "sealed", set: "GD-01", price: 7999, cost: 5600, stock: 11 },
    { name: "RX-78-2 Gundam GD01 SEC", game: "Gundam", category: "single", set: "GD-01", rarity: "SEC", cond: "NM", price: 9800, cost: 6400, stock: 2 },
    // Accessories
    { name: "Ultra Pro Eclipse Sleeves (100) Black", game: "Accessories", category: "accessory", price: 1299, cost: 700, stock: 48, low: 12 },
    { name: "Dragon Shield Matte Sleeves (100) Crimson", game: "Accessories", category: "accessory", price: 1399, cost: 780, stock: 36, low: 12 },
    { name: "KMC Perfect Fit Sleeves (100)", game: "Accessories", category: "accessory", price: 599, cost: 300, stock: 60, low: 20 },
    { name: "Ultimate Guard Boulder 100+ Deck Box", game: "Accessories", category: "accessory", price: 899, cost: 480, stock: 25, low: 8 },
    { name: "Vault X 12-Pocket Binder", game: "Accessories", category: "accessory", price: 3299, cost: 2000, stock: 14, low: 5 },
    { name: "Toploaders 3x4 (25 pack)", game: "Accessories", category: "accessory", price: 499, cost: 220, stock: 80, low: 25 },
    { name: "Playmat — HoshiHits Gold Star Edition", game: "Accessories", category: "accessory", price: 2499, cost: 1100, stock: 18, low: 6 },
    { name: "Card Saver 1 (50 pack)", game: "Accessories", category: "accessory", price: 999, cost: 520, stock: 3, low: 10 },
  ];

  const gameCode: Record<string, string> = {
    "Pokémon": "PKM", "One Piece": "OPC", "Yu-Gi-Oh!": "YGO", "Weiss Schwarz": "WSC",
    "Union Arena": "UNA", "Magic": "MTG", "Digimon": "DGM", "Dragon Ball": "DBS",
    "Gundam": "GCG", "Accessories": "ACC",
  };

  const productIds: number[] = [];
  for (const p of P) {
    const r = insProduct.run(
      sku(gameCode[p.game] ?? "GEN"), bc(), p.name, p.game, p.category,
      p.set ?? null, p.rarity ?? null, p.cond ?? null, p.lang ?? "EN", p.foil ?? 0,
      p.gc ?? null, p.grade ?? null, p.gc ? `CERT-${ri(10000000, 99999999)}` : null,
      p.price, p.cost, p.stock, p.low ?? 4, ts(daysAgo(ri(60, 180)))
    );
    productIds.push(Number(r.lastInsertRowid));
  }

  // ---- Customers ---------------------------------------------------------
  const insCustomer = db.prepare(
    "INSERT INTO customers (name, phone, email, notes, created_at) VALUES (?,?,?,?,?)"
  );
  const customers = [
    ["Vannak Prum", "+855 12 345 678", "vannak@gmail.com"],
    ["Sreyneang Ly", "+855 96 555 234", "sreyneang@gmail.com"],
    ["Kenji Tanaka", "+855 78 800 113", "kenji.t@gmail.com"],
    ["Ratanak Chea", "+855 11 223 344", "ratanak@outlook.com"],
    ["Molika Heng", "+855 92 445 566", "molika.h@gmail.com"],
    ["David Park", "+855 15 667 788", "dpark@gmail.com"],
    ["Chanlina Sok", "+855 87 998 001", "chanlina@gmail.com"],
    ["Marcus Webb", "+855 10 334 455", "mwebb@proton.me"],
    ["Akira Yamamoto", "+855 93 221 100", "akira.y@gmail.com"],
    ["Bopha Nem", "+855 69 887 766", "bopha.n@gmail.com"],
    ["Leo Zhang", "+855 17 456 789", "leozh@gmail.com"],
    ["Sovann Pich", "+855 81 234 567", "sovann.p@gmail.com"],
    ["Emma Larsen", "+855 71 909 808", "emma.l@gmail.com"],
    ["Rithy Oum", "+855 99 121 212", "rithy.oum@gmail.com"],
  ] as const;
  for (const [name, phone, email] of customers) {
    insCustomer.run(name, phone, email, null, ts(daysAgo(ri(30, 300))));
  }
  const customerCount = customers.length;

  // ---- Sales history (last 60 days) --------------------------------------
  const insSale = db.prepare(
    `INSERT INTO sales (number, customer_id, user_id, subtotal, discount, total, cost_total, payment_method, amount_paid, change_due, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'completed', ?)`
  );
  const insItem = db.prepare(
    "INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price, unit_cost) VALUES (?,?,?,?,?,?)"
  );
  const prodRows = db.prepare("SELECT id, name, price, cost, category FROM products").all() as
    { id: number; name: string; price: number; cost: number; category: string }[];
  // Weight cheaper items so most transactions look like sleeves/singles, with occasional whales.
  const affordable = prodRows.filter((p) => p.price < 20000);
  const premium = prodRows.filter((p) => p.price >= 20000);
  const methods = ["cash", "card", "qr", "cash", "qr", "card", "cash"];

  let saleSeq = 1;
  for (let day = 60; day >= 0; day--) {
    // gentle upward trend + weekend bumps
    const d0 = daysAgo(day);
    const dow = d0.getDay();
    const base = 3 + Math.round((60 - day) / 18);
    const nSales = ri(base, base + (dow === 0 || dow === 6 ? 6 : 3));
    for (let s = 0; s < nSales; s++) {
      const when = daysAgo(day, ri(10, 20), ri(0, 59));
      if (when > now) continue;
      const nItems = ri(1, 3);
      let subtotal = 0, costTotal = 0;
      const items: { id: number; name: string; qty: number; price: number; cost: number }[] = [];
      for (let i = 0; i < nItems; i++) {
        const pool = rnd() < 0.9 ? affordable : premium;
        const p = pick(pool);
        const qty = p.category === "accessory" ? ri(1, 3) : 1;
        items.push({ id: p.id, name: p.name, qty, price: p.price, cost: p.cost });
        subtotal += p.price * qty;
        costTotal += p.cost * qty;
      }
      const discount = rnd() < 0.12 ? Math.round(subtotal * 0.05) : 0;
      const total = subtotal - discount;
      const method = pick(methods);
      const custId = rnd() < 0.55 ? ri(1, customerCount) : null;
      const paid = method === "cash" ? Math.ceil(total / 500) * 500 : total;
      const r = insSale.run(
        `S-${String(saleSeq++).padStart(5, "0")}`, custId, ri(1, 3),
        subtotal, discount, total, costTotal, method, paid, paid - total, ts(when)
      );
      for (const it of items) {
        insItem.run(Number(r.lastInsertRowid), it.id, it.name, it.qty, it.price, it.cost);
      }
    }
  }

  // ---- Suppliers ---------------------------------------------------------
  const insSupplier = db.prepare(
    "INSERT INTO suppliers (name, contact, email, phone, country, games, notes, created_at) VALUES (?,?,?,?,?,?,?,?)"
  );
  const suppliers = [
    ["Bandai Namco Distribution", "Sato Kenta", "orders@bandai-dist.jp", "+81 3 5555 0100", "Japan", "One Piece, Digimon, Dragon Ball, Union Arena, Gundam"],
    ["Pokémon Center Wholesale", "Linda Mao", "wholesale@pkmn-asia.com", "+65 6555 0188", "Singapore", "Pokémon"],
    ["Konami Asia", "Jun Ho Lee", "b2b@konami-asia.com", "+852 2555 0123", "Hong Kong", "Yu-Gi-Oh!"],
    ["Wizards Distribution SEA", "Priya Nair", "sea-orders@wizards.com", "+65 6555 0777", "Singapore", "Magic"],
    ["Bushiroad Trading", "Aoi Fujita", "trade@bushiroad.co.jp", "+81 3 5555 0912", "Japan", "Weiss Schwarz"],
    ["UP Accessories Direct", "Tom Reyes", "sales@upaccess.com", "+1 469 555 0102", "USA", "Accessories"],
  ] as const;
  for (const [name, contact, email, phone, country, games] of suppliers) {
    insSupplier.run(name, contact, email, phone, country, games, null, ts(daysAgo(ri(90, 250))));
  }

  // ---- Purchase orders + shipments --------------------------------------
  const insPO = db.prepare(
    "INSERT INTO purchase_orders (number, supplier_id, status, expected_date, shipping_cost, notes, created_at) VALUES (?,?,?,?,?,?,?)"
  );
  const insPOItem = db.prepare(
    "INSERT INTO po_items (po_id, product_id, name, qty, unit_cost, received_qty) VALUES (?,?,?,?,?,?)"
  );
  const insShipment = db.prepare(
    "INSERT INTO shipments (reference, po_id, carrier, tracking, origin, status, eta, received_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  const dateStr = (n: number) => ts(daysAgo(-n)).slice(0, 10); // n days in the future

  // PO-00001: received last month
  let po = insPO.run("PO-00001", 2, "received", ts(daysAgo(25)).slice(0, 10), 18000, "Restock Surging Sparks wave 2", ts(daysAgo(38)));
  insPOItem.run(Number(po.lastInsertRowid), productIds[0], P[0].name, 24, 11500, 24);
  insPOItem.run(Number(po.lastInsertRowid), productIds[2], P[2].name, 36, 2450, 36);
  insShipment.run("SHP-00001", Number(po.lastInsertRowid), "DHL Express", "DHL883742190", "Singapore", "received", ts(daysAgo(26)).slice(0, 10), ts(daysAgo(25)), ts(daysAgo(36)));

  // PO-00002: in transit from Japan
  po = insPO.run("PO-00002", 1, "in_transit", dateStr(6), 42000, "OP-10 launch allocation + Union Arena restock", ts(daysAgo(12)));
  insPOItem.run(Number(po.lastInsertRowid), null, "OP-10 Royal Blood Booster Box", 30, 8800, 0);
  insPOItem.run(Number(po.lastInsertRowid), productIds[27], P[27].name, 12, 5000, 0);
  insPOItem.run(Number(po.lastInsertRowid), productIds[34], P[34].name, 12, 5800, 0);
  insShipment.run("SHP-00002", Number(po.lastInsertRowid), "FedEx Intl", "FX449021337", "Tokyo, Japan", "customs", dateStr(6), null, ts(daysAgo(8)));

  // PO-00003: ordered, not shipped
  po = insPO.run("PO-00003", 4, "ordered", dateStr(14), 25000, "MH3 reorder — allocation confirmed", ts(daysAgo(4)));
  insPOItem.run(Number(po.lastInsertRowid), productIds[30], P[30].name, 8, 21000, 0);
  // PO-00004: draft
  po = insPO.run("PO-00004", 6, "draft", null, 0, "Quarterly accessories restock", ts(daysAgo(1)));
  insPOItem.run(Number(po.lastInsertRowid), productIds[40], P[40].name, 100, 680, 0);
  insPOItem.run(Number(po.lastInsertRowid), productIds[47], P[47].name, 40, 500, 0);

  insShipment.run("SHP-00003", null, "Cambodia Post", "CP99201135KH", "Osaka, Japan", "in_transit", dateStr(9), null, ts(daysAgo(5)));

  // ---- Preorders ---------------------------------------------------------
  const insPre = db.prepare(
    `INSERT INTO preorders (number, customer_id, product_id, product_name, game, qty, unit_price, deposit, status, expected_date, user_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const pres = [
    [1, "OP-10 Royal Blood Booster Box", "One Piece", 2, 12999, 5000, "pending", dateStr(6)],
    [3, "OP-10 Royal Blood Booster Box", "One Piece", 1, 12999, 13000, "pending", dateStr(6)],
    [9, "Terastal Festival Booster Box (JP)", "Pokémon", 3, 8999, 9000, "arrived", dateStr(1)],
    [2, "Prismatic Evolutions ETB", "Pokémon", 2, 8999, 4000, "ready", dateStr(0)],
    [8, "MH3 Modern Horizons 3 Play Booster Box", "Magic", 1, 27999, 10000, "ready", dateStr(0)],
    [5, "Hololive Vol.2 Premium Booster Box", "Weiss Schwarz", 1, 8999, 3000, "collected", ts(daysAgo(9)).slice(0, 10)],
    [12, "Gundam Card Game GD-01 Booster Box", "Gundam", 2, 7999, 8000, "collected", ts(daysAgo(15)).slice(0, 10)],
    [4, "Jujutsu Kaisen Vol.2 Booster Box", "Union Arena", 1, 7499, 0, "cancelled", ts(daysAgo(20)).slice(0, 10)],
  ] as const;
  pres.forEach((p, i) => {
    insPre.run(`PRE-${String(i + 1).padStart(4, "0")}`, p[0], null, p[1], p[2], p[3], p[4], p[5], p[6], p[7], 2, ts(daysAgo(ri(3, 30))));
  });

  // ---- Trade-ins / buylist ----------------------------------------------
  const insTrade = db.prepare(
    "INSERT INTO tradeins (number, customer_id, kind, payout_method, total, user_id, created_at) VALUES (?,?,?,?,?,?,?)"
  );
  const insTradeItem = db.prepare(
    "INSERT INTO tradein_items (tradein_id, name, game, condition, qty, unit_value) VALUES (?,?,?,?,?,?)"
  );
  const trades: [number, "buylist" | "tradein", "cash", [string, string, string, number, number][]][] = [
    [1, "buylist", "cash", [["Giratina V Alt Art", "Pokémon", "NM", 1, 14500], ["Lugia V Alt Art", "Pokémon", "LP", 1, 9800]]],
    [4, "tradein", "cash", [["Zoro OP01-025 SP", "One Piece", "NM", 1, 5600]]],
    [9, "buylist", "cash", [["Accursed Black Dragon", "Yu-Gi-Oh!", "NM", 3, 400], ["Snake-Eye Ash UR", "Yu-Gi-Oh!", "NM", 2, 1500]]],
    [2, "tradein", "cash", [["Wrenn and Six", "Magic", "NM", 1, 4800], ["Fury FEA", "Magic", "LP", 1, 2100]]],
    [11, "buylist", "cash", [["Latias ex SIR", "Pokémon", "NM", 1, 8800]]],
  ];
  trades.forEach((t, i) => {
    const total = t[3].reduce((a, it) => a + it[3] * it[4], 0);
    const r = insTrade.run(`TR-${String(i + 1).padStart(4, "0")}`, t[0], t[1], t[2], total, 3, ts(daysAgo(ri(1, 21))));
    for (const it of t[3]) insTradeItem.run(Number(r.lastInsertRowid), it[0], it[1], it[2], it[3], it[4]);
  });

  // ---- Expenses ----------------------------------------------------------
  const insExp = db.prepare(
    "INSERT INTO expenses (category, description, amount, date, user_id, created_at) VALUES (?,?,?,?,?,?)"
  );
  const expCats: [string, string, number][] = [
    ["Rent", "Monthly store rent — Diamond Plaza unit 2F", 180000],
    ["Utilities", "Electricity + water", 24000],
    ["Internet", "Fiber 300Mbps business line", 6900],
    ["Payroll", "Staff salaries", 260000],
    ["Marketing", "Facebook + TikTok ads", 15000],
    ["Supplies", "Receipt paper, bags, cleaning", 4200],
  ];
  for (let m = 2; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 5);
    if (d > now) continue;
    for (const [cat, desc, amt] of expCats) {
      insExp.run(cat, desc, Math.round(amt * (0.95 + rnd() * 0.1)), ts(d).slice(0, 10), 5, ts(d));
    }
  }
  insExp.run("Equipment", "Second receipt printer (Epson TM-T82)", 28900, ts(daysAgo(12)).slice(0, 10), 1, ts(daysAgo(12)));
  insExp.run("Events", "OP-09 launch tournament prizes", 22000, ts(daysAgo(18)).slice(0, 10), 2, ts(daysAgo(18)));

  // ---- Tournaments -------------------------------------------------------
  const insTourn = db.prepare(
    "INSERT INTO tournaments (name, game, date, time, entry_fee, capacity, registered, prize, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  insTourn.run("One Piece Saturday Standard", "One Piece", dateStr(3), "13:00", 500, 32, 27, "OP-09 packs by standing + playmat", "upcoming", ts(daysAgo(10)));
  insTourn.run("Pokémon League Challenge", "Pokémon", dateStr(8), "10:00", 700, 24, 18, "League promos + booster prizes", "upcoming", ts(daysAgo(7)));
  insTourn.run("Yu-Gi-Oh! OTS Locals", "Yu-Gi-Oh!", dateStr(5), "18:00", 500, 16, 9, "OTS packs", "upcoming", ts(daysAgo(4)));
  insTourn.run("Union Arena Showdown", "Union Arena", dateStr(15), "14:00", 600, 16, 4, "Promo cards + store credit", "upcoming", ts(daysAgo(2)));
  insTourn.run("MTG Friday Night Magic — Modern", "Magic", ts(daysAgo(2)).slice(0, 10), "19:00", 800, 20, 20, "Store credit by standing", "completed", ts(daysAgo(16)));
  insTourn.run("Weiss Schwarz Neo Showdown", "Weiss Schwarz", ts(daysAgo(9)).slice(0, 10), "15:00", 500, 16, 12, "Bushiroad sleeves + packs", "completed", ts(daysAgo(23)));

  // ---- Settings ----------------------------------------------------------
  const insSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)");
  insSetting.run("store_name", "HoshiHits Card Shop");
  insSetting.run("store_tagline", "Premium TCG · Singles · Sealed · Graded");
  insSetting.run("store_phone", "+855 12 900 900");
  insSetting.run("store_address", "Diamond Plaza 2F, Phnom Penh, Cambodia");
  insSetting.run("currency", "USD");
  insSetting.run("receipt_footer", "Thank you for shopping at HoshiHits! ★ Follow @hoshihits");

  // ---- Audit -------------------------------------------------------------
  const insAudit = db.prepare(
    "INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?,?,?,?,?,?)"
  );
  insAudit.run(1, "system.seed", null, null, "Initial store data seeded", ts());
}
