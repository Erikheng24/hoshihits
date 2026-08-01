import "server-only";
import { getDb } from "./db";

/**
 * One definition per printable / exportable section. Everything downstream —
 * the Excel workbook, the CSV, and the print page — is generated from these, so
 * a section only has to be described once.
 */

export type ColType = "text" | "int" | "money" | "date" | "datetime" | "percent";

export interface ReportColumn {
  key: string;
  header: string;
  type?: ColType;   // default "text"
  width?: number;   // Excel column width
  total?: boolean;  // include this column in the totals row
}

export interface ReportDef {
  title: string;
  moduleKey: string; // access is checked against this module
  columns: ReportColumn[];
  rows: () => Record<string, unknown>[];
  /** When true, each row's `image` field (a data URL) is shown as a thumbnail
   *  in the printed PDF and the Excel export. */
  thumbnail?: boolean;
}

const q = (sql: string, ...args: unknown[]) =>
  getDb().prepare(sql).all(...args) as Record<string, unknown>[];

export const REPORTS: Record<string, ReportDef> = {
  inventory: {
    title: "Inventory",
    moduleKey: "inventory",
    thumbnail: true,
    columns: [
      { key: "sku", header: "SKU", width: 14 },
      { key: "name", header: "Product", width: 38 },
      { key: "game", header: "Game", width: 14 },
      { key: "category", header: "Category", width: 12 },
      { key: "set_name", header: "Set", width: 20 },
      { key: "rarity", header: "Rarity / No.", width: 12 },
      { key: "condition", header: "Cond.", width: 8 },
      { key: "grade", header: "Grade", width: 8 },
      { key: "stock", header: "Stock", type: "int", width: 8, total: true },
      { key: "cost", header: "Cost", type: "money", width: 12 },
      { key: "price", header: "Price", type: "money", width: 12 },
      { key: "stock_value", header: "Stock Value", type: "money", width: 14, total: true },
    ],
    rows: () =>
      q(`SELECT sku, name, game, category, set_name, rarity, condition, grade,
                stock, cost, price, (cost * stock) stock_value, image
         FROM products WHERE active = 1 ORDER BY name`),
  },

  singles: {
    title: "Singles",
    moduleKey: "singles",
    thumbnail: true,
    columns: [
      { key: "sku", header: "SKU", width: 14 },
      { key: "name", header: "Card", width: 38 },
      { key: "game", header: "Game", width: 14 },
      { key: "set_name", header: "Set", width: 22 },
      { key: "rarity", header: "Rarity / No.", width: 12 },
      { key: "condition", header: "Cond.", width: 8 },
      { key: "stock", header: "Stock", type: "int", width: 8, total: true },
      { key: "cost", header: "Cost", type: "money", width: 12 },
      { key: "price", header: "Price", type: "money", width: 12 },
      { key: "stock_value", header: "Stock Value", type: "money", width: 14, total: true },
    ],
    rows: () =>
      q(`SELECT sku, name, game, set_name, rarity, condition, stock, cost, price,
                (cost * stock) stock_value, image
         FROM products WHERE active = 1 AND category = 'single' ORDER BY name`),
  },

  graded: {
    title: "Graded Cards",
    moduleKey: "graded",
    thumbnail: true,
    columns: [
      { key: "sku", header: "SKU", width: 14 },
      { key: "name", header: "Card", width: 36 },
      { key: "game", header: "Game", width: 14 },
      { key: "set_name", header: "Set", width: 20 },
      { key: "grade_company", header: "Grader", width: 10 },
      { key: "grade", header: "Grade", width: 8 },
      { key: "cert_number", header: "Cert #", width: 16 },
      { key: "stock", header: "Qty", type: "int", width: 7, total: true },
      { key: "cost", header: "Cost", type: "money", width: 12 },
      { key: "price", header: "Price", type: "money", width: 12, total: true },
    ],
    rows: () =>
      q(`SELECT sku, name, game, set_name, grade_company, grade, cert_number, stock, cost, price, image
         FROM products WHERE active = 1 AND category = 'graded' ORDER BY name`),
  },

  sales: {
    title: "Sales",
    moduleKey: "reports",
    columns: [
      { key: "number", header: "Receipt", width: 14 },
      { key: "created_at", header: "Date", type: "datetime", width: 18 },
      { key: "customer", header: "Customer", width: 24 },
      { key: "cashier", header: "Cashier", width: 18 },
      { key: "payment_method", header: "Payment", width: 11 },
      { key: "subtotal", header: "Subtotal", type: "money", width: 13, total: true },
      { key: "discount", header: "Discount", type: "money", width: 12, total: true },
      { key: "total", header: "Total", type: "money", width: 13, total: true },
      { key: "profit", header: "Profit", type: "money", width: 13, total: true },
    ],
    rows: () =>
      q(`SELECT s.number, s.created_at, COALESCE(c.name,'Walk-in') customer, u.name cashier,
                s.payment_method, s.subtotal, s.discount, s.total,
                (s.total - s.cost_total) profit
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.status = 'completed' ORDER BY s.id DESC`),
  },

  "sales-detail": {
    title: "Sales — Item Detail",
    moduleKey: "reports",
    columns: [
      { key: "number", header: "Receipt", width: 14 },
      { key: "created_at", header: "Date", type: "datetime", width: 18 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "item", header: "Item", width: 38 },
      { key: "qty", header: "Qty", type: "int", width: 7, total: true },
      { key: "unit_price", header: "Unit Price", type: "money", width: 13 },
      { key: "line_total", header: "Line Total", type: "money", width: 13, total: true },
      { key: "payment_method", header: "Payment", width: 11 },
    ],
    rows: () =>
      q(`SELECT s.number, s.created_at, COALESCE(c.name,'Walk-in') customer,
                si.name item, si.qty, si.unit_price, (si.qty * si.unit_price) line_total,
                s.payment_method
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.status = 'completed' ORDER BY s.id DESC`),
  },

  customers: {
    title: "Customers",
    moduleKey: "customers",
    columns: [
      { key: "name", header: "Customer", width: 26 },
      { key: "phone", header: "Phone", width: 16 },
      { key: "email", header: "Email", width: 28 },
      { key: "orders", header: "Orders", type: "int", width: 9, total: true },
      { key: "spent", header: "Total Spent", type: "money", width: 14, total: true },
      { key: "last_order", header: "Last Order", type: "datetime", width: 18 },
      { key: "notes", header: "Notes", width: 30 },
    ],
    rows: () =>
      q(`SELECT c.name, c.phone, c.email,
                COUNT(s.id) orders, COALESCE(SUM(s.total),0) spent,
                MAX(s.created_at) last_order, c.notes
         FROM customers c
         LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'completed'
         GROUP BY c.id ORDER BY spent DESC, c.name`),
  },

  preorders: {
    title: "Preorders",
    moduleKey: "preorders",
    thumbnail: true,
    columns: [
      { key: "number", header: "Preorder", width: 14 },
      { key: "created_at", header: "Taken", type: "datetime", width: 18 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "product_name", header: "Items", width: 34 },
      { key: "game", header: "Game", width: 13 },
      { key: "qty", header: "Qty", type: "int", width: 7, total: true },
      { key: "order_total", header: "Order Total", type: "money", width: 13, total: true },
      { key: "deposit", header: "Deposit", type: "money", width: 12, total: true },
      { key: "balance", header: "Balance Due", type: "money", width: 13, total: true },
      { key: "status", header: "Status", width: 12 },
      { key: "expected_date", header: "Expected", type: "date", width: 13 },
    ],
    rows: () =>
      q(`SELECT po.number, po.created_at, c.name customer, po.product_name, po.game,
                po.qty, COALESCE(po.total, po.unit_price * po.qty) order_total, po.deposit,
                MAX(0, COALESCE(po.total, po.unit_price * po.qty) - po.deposit) balance,
                po.status, po.expected_date, po.image
         FROM preorders po
         LEFT JOIN customers c ON c.id = po.customer_id
         ORDER BY po.id DESC`),
  },

  tradein: {
    title: "Trade-Ins & Buylist",
    moduleKey: "tradein",
    columns: [
      { key: "number", header: "Reference", width: 14 },
      { key: "created_at", header: "Date", type: "datetime", width: 18 },
      { key: "customer", header: "Customer", width: 24 },
      { key: "kind", header: "Type", width: 12 },
      { key: "payout_method", header: "Payout", width: 12 },
      { key: "total", header: "Total Paid", type: "money", width: 14, total: true },
      { key: "staff", header: "Staff", width: 18 },
    ],
    rows: () =>
      q(`SELECT t.number, t.created_at, COALESCE(c.name,'Walk-in') customer, t.kind,
                t.payout_method, t.total, u.name staff
         FROM tradeins t
         LEFT JOIN customers c ON c.id = t.customer_id
         LEFT JOIN users u ON u.id = t.user_id
         ORDER BY t.id DESC`),
  },

  suppliers: {
    title: "Suppliers",
    moduleKey: "suppliers",
    columns: [
      { key: "name", header: "Supplier", width: 26 },
      { key: "contact", header: "Contact", width: 20 },
      { key: "email", header: "Email", width: 28 },
      { key: "phone", header: "Phone", width: 16 },
      { key: "country", header: "Country", width: 14 },
      { key: "games", header: "Games", width: 24 },
    ],
    rows: () => q(`SELECT name, contact, email, phone, country, games FROM suppliers ORDER BY name`),
  },

  "purchase-orders": {
    title: "Purchase Orders",
    moduleKey: "purchase-orders",
    columns: [
      { key: "number", header: "PO", width: 14 },
      { key: "supplier", header: "Supplier", width: 24 },
      { key: "status", header: "Status", width: 13 },
      { key: "created_at", header: "Raised", type: "datetime", width: 18 },
      { key: "expected_date", header: "Expected", type: "date", width: 13 },
      { key: "items", header: "Units", type: "int", width: 9, total: true },
      { key: "goods_cost", header: "Goods Cost", type: "money", width: 14, total: true },
      { key: "shipping_cost", header: "Shipping", type: "money", width: 12, total: true },
    ],
    rows: () =>
      q(`SELECT po.number, sp.name supplier, po.status, po.created_at, po.expected_date,
                COALESCE(SUM(pi.qty),0) items,
                COALESCE(SUM(pi.qty * pi.unit_cost),0) goods_cost,
                po.shipping_cost
         FROM purchase_orders po
         LEFT JOIN suppliers sp ON sp.id = po.supplier_id
         LEFT JOIN po_items pi ON pi.po_id = po.id
         GROUP BY po.id ORDER BY po.id DESC`),
  },

  shipments: {
    title: "Shipments",
    moduleKey: "shipments",
    columns: [
      { key: "reference", header: "Reference", width: 16 },
      { key: "po_number", header: "PO", width: 13 },
      { key: "carrier", header: "Carrier", width: 16 },
      { key: "tracking", header: "Tracking", width: 20 },
      { key: "origin", header: "Origin", width: 18 },
      { key: "status", header: "Status", width: 13 },
      { key: "eta", header: "ETA", type: "date", width: 13 },
      { key: "received_at", header: "Received", type: "datetime", width: 18 },
    ],
    rows: () =>
      q(`SELECT sh.reference, po.number po_number, sh.carrier, sh.tracking, sh.origin,
                sh.status, sh.eta, sh.received_at
         FROM shipments sh
         LEFT JOIN purchase_orders po ON po.id = sh.po_id
         ORDER BY sh.id DESC`),
  },

  expenses: {
    title: "Expenses",
    moduleKey: "accounting",
    columns: [
      { key: "date", header: "Date", type: "date", width: 13 },
      { key: "category", header: "Category", width: 18 },
      { key: "description", header: "Description", width: 40 },
      { key: "staff", header: "Recorded By", width: 18 },
      { key: "amount", header: "Amount", type: "money", width: 14, total: true },
    ],
    rows: () =>
      q(`SELECT e.date, e.category, e.description, u.name staff, e.amount
         FROM expenses e LEFT JOIN users u ON u.id = e.user_id
         ORDER BY e.date DESC, e.id DESC`),
  },

  tournaments: {
    title: "Tournaments",
    moduleKey: "tournaments",
    columns: [
      { key: "name", header: "Event", width: 30 },
      { key: "game", header: "Game", width: 16 },
      { key: "date", header: "Date", type: "date", width: 13 },
      { key: "time", header: "Time", width: 9 },
      { key: "entry_fee", header: "Entry Fee", type: "money", width: 12 },
      { key: "registered", header: "Players", type: "int", width: 9, total: true },
      { key: "capacity", header: "Capacity", type: "int", width: 10 },
      { key: "status", header: "Status", width: 12 },
      { key: "prize", header: "Prize", width: 26 },
    ],
    rows: () =>
      q(`SELECT name, game, date, time, entry_fee, registered, capacity, status, prize
         FROM tournaments ORDER BY date DESC`),
  },

  employees: {
    title: "Employees",
    moduleKey: "employees",
    columns: [
      { key: "name", header: "Name", width: 26 },
      { key: "email", header: "Email", width: 30 },
      { key: "role", header: "Role", width: 14 },
      { key: "status", header: "Status", width: 10 },
      { key: "created_at", header: "Added", type: "datetime", width: 18 },
    ],
    rows: () =>
      q(`SELECT name, email, role, CASE active WHEN 1 THEN 'Active' ELSE 'Disabled' END status, created_at
         FROM users ORDER BY role, name`),
  },
};

export function getReport(section: string): ReportDef | null {
  return Object.prototype.hasOwnProperty.call(REPORTS, section) ? REPORTS[section] : null;
}

/** Money is stored as integer cents; exports want real currency numbers. */
export function cellValue(row: Record<string, unknown>, col: ReportColumn): unknown {
  const raw = row[col.key];
  if (raw === null || raw === undefined) return col.type === "money" || col.type === "int" ? 0 : "";
  if (col.type === "money") return Number(raw) / 100;
  if (col.type === "int") return Number(raw);
  return raw;
}
