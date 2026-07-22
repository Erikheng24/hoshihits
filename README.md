# HoshiHits Card Shop — ERP + POS

A complete operating system for a premium Trading Card Game store: point of sale, inventory
(sealed / singles / graded / accessories), preorders, buylist & trade-ins, suppliers,
purchase orders, international shipments, customer CRM,
tournaments, accounting, reports with CSV export, employees, and a full audit log.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind + SQLite (better-sqlite3)**.
One codebase serves desktop and mobile — the phone layout has a bottom tab bar, a
slide-in drawer, and an installable PWA manifest.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

The database is created and seeded automatically on first run at `data/hoshihits.db`
(48 products across 10 game lines, 60 days of sales history, customers, POs, shipments,
expenses, tournaments). Delete that file to reset to a fresh seeded store.

## Demo accounts (password: `hoshi123`)

| Email | Role | Access |
|---|---|---|
| owner@hoshihits.com | Owner | Everything |
| manager@hoshihits.com | Manager | Sales, inventory, preorders, customers, reports |
| cashier@hoshihits.com | Cashier | POS, customers, trade-in, preorders |
| inventory@hoshihits.com | Inventory | Stock, shipments, suppliers, POs |
| accountant@hoshihits.com | Accountant | Accounting, reports |

## Highlights

- **POS**: search or scan (USB barcode scanners send code + Enter), category/game filters,
  cart with quantity steppers, customer attach, % or $ discounts, cash/card/QR
  payment, change calculation, stock decrement, printable receipt.
- **Supply chain**: PO lifecycle draft → ordered → in transit → received; receiving a PO or
  its linked shipment stocks catalog-linked lines into inventory automatically.
- **Buylist/trade-in**: multi-line intake paying cash, optional
  auto-listing of bought cards as singles at +40% markup.
- **Money is stored in integer cents**; document numbers (S-/PRE-/PO-/SHP-/TR-) are
  sequential; every mutation is written to the audit log (visible in Settings).
- **Security**: scrypt password hashes, HMAC-signed httpOnly session cookies, per-module
  role checks enforced in every page *and* every server action.

## Deploying to Railway (permanent link)

The app stores data in a SQLite file, so it needs a host with a **persistent disk**.
Railway is the recommended target; a `Dockerfile` and `railway.json` are included.

1. Push this folder to a **GitHub repo** (`.gitignore` already excludes `data/`, `backups/`, `.env.local`).
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo** → pick the repo.
   It auto-detects the Dockerfile.
3. Add a **Volume**: mount path **`/data`** (this is where the database lives and survives redeploys).
4. Set **Variables**:

   | Variable | Value |
   |---|---|
   | `HOSHI_SECRET` | a long random string (session signing) |
   | `DATA_DIR` | `/data` |
   | `PSA_API_TOKEN` | your PSA Public API token (optional) |
   | `POKEMON_TCG_API_KEY` | key from dev.pokemontcg.io (optional) |
   | `UPC_API_KEY` | UPC database key (optional) |

   Do **not** set `SEED_DEMO` — leaving it unset keeps the demo data out.
5. **Generate Domain** under Settings → Networking. That URL is permanent; every future
   deploy updates the same link.

### First run
The first visit shows a one-time **Create owner account** screen. The account you make there
is the OWNER; afterwards `/setup` is closed permanently and further logins are created by the
owner under **Employees**.

## Scan-to-add (camera)

Adding a product opens with a camera scanner (rear camera on phones; photo-upload fallback on desktop):

- **Graded slab** → scans the **QR code** and looks the cert up on **PSA**, auto-filling card name, cert number, grade, and the slab photo.
- **Sealed box** → scans the **barcode (UPC/EAN)** and looks the product up, auto-filling name + photo.
- **Raw card** → photographs the card and reads it with on-device OCR, filling name, collector number, and rarity (AR/SAR/SIR…).

Every scan lands on a **confirm screen** before saving, and each type also has a manual code-entry box.

### API tokens (optional but recommended)

The lookups use official APIs when a token is present, and fall back to a built-in **demo dataset** otherwise (so the flow works out of the box). Set these as environment variables to enable live data:

| Variable | Enables | Where to get it |
|---|---|---|
| `PSA_API_TOKEN` | Live PSA cert lookups + real slab photos | Register at psacard.com → Public API (free tier) |
| `UPC_API_KEY` | Live product lookups for box barcodes | A UPC database provider (e.g. UPCitemdb) |
| `HOSHI_SECRET` | Session-cookie signing key (set in production) | Any long random string |

Raw-card auto-ID is OCR-based (assistive); a paid image-recognition API would be needed for exact name+rarity on every raw card — the provider layer in `src/lib/providers/` is structured to add one.
