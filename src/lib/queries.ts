import { getDb } from "./db";
import { SHOP_NOW } from "@/lib/tz";

const one = <T,>(sql: string, ...args: unknown[]) => getDb().prepare(sql).get(...args) as T;
const all = <T,>(sql: string, ...args: unknown[]) => getDb().prepare(sql).all(...args) as T[];

export interface DayPoint { day: string; revenue: number; profit: number; orders: number }

export function dashboardData() {
  const kpiToday = one<{ revenue: number; profit: number; orders: number; customers: number }>(
    `SELECT COALESCE(SUM(total),0) revenue,
            COALESCE(SUM(total - cost_total),0) profit,
            COUNT(*) orders,
            COUNT(DISTINCT customer_id) customers
     FROM sales WHERE status='completed' AND date(created_at) = date(${SHOP_NOW})`
  );
  const kpiYesterday = one<{ revenue: number; orders: number }>(
    `SELECT COALESCE(SUM(total),0) revenue, COUNT(*) orders
     FROM sales WHERE status='completed' AND date(created_at) = date(${SHOP_NOW},'-1 day')`
  );
  const inventory = one<{ value: number; retail: number; skus: number; units: number }>(
    `SELECT COALESCE(SUM(cost*stock),0) value, COALESCE(SUM(price*stock),0) retail,
            COUNT(*) skus, COALESCE(SUM(stock),0) units
     FROM products WHERE active=1`
  );
  const lowStock = all<{ id: number; name: string; game: string; stock: number; low_stock: number; sku: string }>(
    `SELECT id, name, game, stock, low_stock, sku FROM products
     WHERE active=1 AND stock <= low_stock ORDER BY (stock - low_stock) ASC, stock ASC LIMIT 8`
  );
  const pendingPreorders = one<{ c: number; deposits: number }>(
    `SELECT COUNT(*) c, COALESCE(SUM(deposit),0) deposits FROM preorders WHERE status IN ('pending','arrived')`
  );
  const readyPickup = one<{ c: number }>(`SELECT COUNT(*) c FROM preorders WHERE status='ready'`);
  const incomingShipments = one<{ c: number }>(
    `SELECT COUNT(*) c FROM shipments WHERE status IN ('processing','in_transit','customs','arrived')`
  );
  const monthExpenses = one<{ total: number }>(
    `SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE strftime('%Y-%m', date) = strftime('%Y-%m',${SHOP_NOW})`
  );
  const daily = all<DayPoint>(
    `SELECT date(created_at) day, SUM(total) revenue, SUM(total - cost_total) profit, COUNT(*) orders
     FROM sales WHERE status='completed' AND date(created_at) >= date(${SHOP_NOW},'-29 day')
     GROUP BY day ORDER BY day`
  );
  const monthly = all<{ month: string; revenue: number; profit: number }>(
    `SELECT strftime('%Y-%m', created_at) month, SUM(total) revenue, SUM(total - cost_total) profit
     FROM sales WHERE status='completed' AND created_at >= date(${SHOP_NOW},'start of month','-5 months')
     GROUP BY month ORDER BY month`
  );
  const bestSellers = all<{ name: string; qty: number; revenue: number }>(
    `SELECT si.name, SUM(si.qty) qty, SUM(si.qty * si.unit_price) revenue
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status='completed' AND date(s.created_at) >= date(${SHOP_NOW},'-29 day')
     GROUP BY si.name ORDER BY revenue DESC LIMIT 6`
  );
  const topCustomers = all<{ id: number; name: string; spent: number; orders: number }>(
    `SELECT c.id, c.name, SUM(s.total) spent, COUNT(*) orders
     FROM sales s JOIN customers c ON c.id = s.customer_id
     WHERE s.status='completed' AND date(s.created_at) >= date(${SHOP_NOW},'-29 day')
     GROUP BY c.id ORDER BY spent DESC LIMIT 5`
  );
  const recentSales = all<{ id: number; number: string; total: number; payment_method: string; created_at: string; customer: string | null }>(
    `SELECT s.id, s.number, s.total, s.payment_method, s.created_at, c.name customer
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     ORDER BY s.id DESC LIMIT 7`
  );
  const recentActivity = all<{ action: string; details: string | null; created_at: string; user: string | null }>(
    `SELECT a.action, a.details, a.created_at, u.name user
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC LIMIT 8`
  );
  const weekRevenue = all<{ day: string; revenue: number }>(
    `SELECT date(created_at) day, SUM(total) revenue FROM sales
     WHERE status='completed' AND date(created_at) >= date(${SHOP_NOW},'-6 day')
     GROUP BY day ORDER BY day`
  );

  return {
    kpiToday, kpiYesterday, inventory, lowStock, pendingPreorders, readyPickup,
    incomingShipments, monthExpenses, daily, monthly, bestSellers, topCustomers,
    recentSales, recentActivity, weekRevenue,
  };
}
