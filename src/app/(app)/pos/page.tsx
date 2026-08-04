import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { paywayConfigured } from "@/lib/providers/payway";
import { PosClient } from "./PosClient";

export const dynamic = "force-dynamic";

export default function PosPage() {
  requireModule("pos");
  const db = getDb();
  const products = db
    .prepare(
      `SELECT id, sku, barcode, name, game, category, set_name, price, stock, grade_company, grade, condition,
              (image IS NOT NULL AND image != '') AS has_image
       FROM products WHERE active=1 ORDER BY game, name`
    )
    .all() as any[];
  const customers = db
    .prepare("SELECT id, name, phone FROM customers ORDER BY name")
    .all() as any[];
  const games = Array.from(new Set(products.map((p) => p.game))) as string[];

  return <PosClient products={products} customers={customers} games={games} cardGateway={paywayConfigured()} />;
}
