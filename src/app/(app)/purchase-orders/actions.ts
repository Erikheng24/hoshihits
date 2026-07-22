"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, nextNumber, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export async function createPoAction(formData: FormData) {
  const user = requireModule("purchase-orders");
  const db = getDb();
  const supplierId = Number(formData.get("supplier_id"));
  const expected = String(formData.get("expected_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!supplierId) throw new Error("Supplier is required.");

  const number = nextNumber("PO", "purchase_orders");
  const r = db
    .prepare("INSERT INTO purchase_orders (number, supplier_id, status, expected_date, shipping_cost, notes, created_at) VALUES (?,?,'draft',?,0,?,?)")
    .run(number, supplierId, expected, notes, ts());
  const id = Number(r.lastInsertRowid);
  audit(user.id, "po.create", "purchase_order", id, number);
  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${id}`);
}

export async function addPoItemAction(formData: FormData) {
  const user = requireModule("purchase-orders");
  const db = getDb();
  const poId = Number(formData.get("po_id"));
  const productId = Number(formData.get("product_id") || 0) || null;
  let name = String(formData.get("name") ?? "").trim();
  const qty = Math.max(1, Math.round(Number(formData.get("qty") ?? 1)));
  const unitCost = Math.round((parseFloat(String(formData.get("unit_cost") ?? "0")) || 0) * 100);

  const po = db.prepare("SELECT status FROM purchase_orders WHERE id=?").get(poId) as { status: string } | undefined;
  if (!po) throw new Error("PO not found.");
  if (!["draft", "ordered"].includes(po.status)) throw new Error("Items can only be added to draft or ordered POs.");

  if (productId) {
    const p = db.prepare("SELECT name FROM products WHERE id=?").get(productId) as { name: string } | undefined;
    if (p) name = p.name;
  }
  if (!name) throw new Error("Item name is required.");
  if (unitCost < 0) throw new Error("Invalid cost.");

  db.prepare("INSERT INTO po_items (po_id, product_id, name, qty, unit_cost, received_qty) VALUES (?,?,?,?,?,0)")
    .run(poId, productId, name, qty, unitCost);
  audit(user.id, "po.add_item", "purchase_order", poId, `${name} ×${qty}`);
  revalidatePath(`/purchase-orders/${poId}`);
  redirect(`/purchase-orders/${poId}`);
}

export async function removePoItemAction(formData: FormData) {
  const user = requireModule("purchase-orders");
  const db = getDb();
  const itemId = Number(formData.get("item_id"));
  const item = db.prepare("SELECT po_id, name FROM po_items WHERE id=?").get(itemId) as { po_id: number; name: string } | undefined;
  if (!item) throw new Error("Item not found.");
  const po = db.prepare("SELECT status FROM purchase_orders WHERE id=?").get(item.po_id) as { status: string };
  if (!["draft", "ordered"].includes(po.status)) throw new Error("Cannot modify this PO.");
  db.prepare("DELETE FROM po_items WHERE id=?").run(itemId);
  audit(user.id, "po.remove_item", "purchase_order", item.po_id, item.name);
  revalidatePath(`/purchase-orders/${item.po_id}`);
  redirect(`/purchase-orders/${item.po_id}`);
}

export async function setPoStatusAction(formData: FormData) {
  const user = requireModule("purchase-orders");
  const db = getDb();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  const po = db.prepare("SELECT number, status FROM purchase_orders WHERE id=?").get(id) as { number: string; status: string } | undefined;
  if (!po) throw new Error("PO not found.");

  const allowed: Record<string, string[]> = {
    draft: ["ordered", "cancelled"],
    ordered: ["in_transit", "cancelled"],
    in_transit: ["received"],
  };
  if (!allowed[po.status]?.includes(status)) throw new Error(`Cannot move PO from ${po.status} to ${status}.`);

  db.transaction(() => {
    db.prepare("UPDATE purchase_orders SET status=? WHERE id=?").run(status, id);
    if (status === "received") {
      // Stock in every linked line and mark quantities received.
      const items = db.prepare("SELECT id, product_id, qty FROM po_items WHERE po_id=?").all(id) as
        { id: number; product_id: number | null; qty: number }[];
      for (const it of items) {
        db.prepare("UPDATE po_items SET received_qty=? WHERE id=?").run(it.qty, it.id);
        if (it.product_id) db.prepare("UPDATE products SET stock = stock + ? WHERE id=?").run(it.qty, it.product_id);
      }
      db.prepare("UPDATE shipments SET status='received', received_at=? WHERE po_id=? AND status != 'received'").run(ts(), id);
    }
    if (status === "in_transit") {
      const existing = db.prepare("SELECT id FROM shipments WHERE po_id=?").get(id);
      if (!existing) {
        const ref = nextNumber("SHP", "shipments");
        db.prepare("INSERT INTO shipments (reference, po_id, carrier, tracking, origin, status, eta, created_at) VALUES (?,?,?,?,?,'in_transit',?,?)")
          .run(ref, id, null, null, null, (db.prepare("SELECT expected_date FROM purchase_orders WHERE id=?").get(id) as any).expected_date, ts());
      }
    }
  })();

  audit(user.id, "po.status", "purchase_order", id, `${po.number}: ${po.status} → ${status}`);
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/shipments");
  revalidatePath("/inventory");
  redirect(`/purchase-orders/${id}`);
}

export async function advanceShipmentAction(formData: FormData) {
  const user = requireModule("shipments");
  const db = getDb();
  const id = Number(formData.get("id"));
  const s = db.prepare("SELECT reference, status, po_id FROM shipments WHERE id=?").get(id) as
    { reference: string; status: string; po_id: number | null } | undefined;
  if (!s) throw new Error("Shipment not found.");

  const flow: Record<string, string> = { processing: "in_transit", in_transit: "customs", customs: "arrived", arrived: "received" };
  const next = flow[s.status];
  if (!next) throw new Error("Shipment is already received.");

  db.transaction(() => {
    db.prepare("UPDATE shipments SET status=?, received_at=? WHERE id=?").run(next, next === "received" ? ts() : null, id);
    if (next === "received" && s.po_id) {
      const po = db.prepare("SELECT status FROM purchase_orders WHERE id=?").get(s.po_id) as { status: string };
      if (po.status !== "received") {
        const items = db.prepare("SELECT id, product_id, qty FROM po_items WHERE po_id=?").all(s.po_id) as
          { id: number; product_id: number | null; qty: number }[];
        for (const it of items) {
          db.prepare("UPDATE po_items SET received_qty=? WHERE id=?").run(it.qty, it.id);
          if (it.product_id) db.prepare("UPDATE products SET stock = stock + ? WHERE id=?").run(it.qty, it.product_id);
        }
        db.prepare("UPDATE purchase_orders SET status='received' WHERE id=?").run(s.po_id);
      }
    }
  })();

  audit(user.id, "shipments.status", "shipment", id, `${s.reference}: ${s.status} → ${next}`);
  revalidatePath("/shipments");
  revalidatePath("/purchase-orders");
  revalidatePath("/inventory");
  redirect("/shipments");
}
