import Link from "next/link";
import { getDb, getAiUsage } from "@/lib/db";
import { money, num } from "@/lib/format";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { ReportActions } from "@/components/ReportActions";
import { Icon } from "@/components/icons";
import { SearchToolbar } from "@/components/SearchToolbar";
import { ProductFormClient } from "@/components/ProductFormClient";
import { ScanToAddButton } from "@/components/ScanToAddButton";
import { saveProductAction, adjustStockAction, archiveProductAction, setProductDiscountAction } from "@/app/(app)/inventory/actions";
import { enrichScan, quickAddProductAction, identifyPhotoAction } from "@/app/(app)/inventory/enrich";

export const GAMES = [
  "Pokémon", "One Piece", "Yu-Gi-Oh!", "Weiss Schwarz", "Union Arena",
  "Magic", "Digimon", "Dragon Ball", "Gundam", "Accessories",
];

export interface InventorySearchParams {
  q?: string;
  game?: string;
  category?: string;
  stock?: string;
  new?: string;
  edit?: string;
}

export function queryProducts(sp: InventorySearchParams, forcedCategory?: string) {
  const db = getDb();
  const clauses = ["active = 1"];
  const args: unknown[] = [];
  if (forcedCategory) {
    clauses.push("category = ?");
    args.push(forcedCategory);
  } else if (sp.category) {
    clauses.push("category = ?");
    args.push(sp.category);
  }
  if (sp.game) {
    clauses.push("game = ?");
    args.push(sp.game);
  }
  if (sp.q) {
    clauses.push("(name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR set_name LIKE ? OR cert_number LIKE ?)");
    const like = `%${sp.q}%`;
    args.push(like, like, like, like, like);
  }
  if (sp.stock === "low") clauses.push("stock <= low_stock");
  if (sp.stock === "out") clauses.push("stock = 0");
  // Only the columns the list needs — NOT the base64 image data URLs (image,
  // image2, image3), which are heavy over a remote DB read. Thumbnails load via
  // /api/product-image/<id>. The edit modal still fetches the full row.
  return db
    .prepare(
      `SELECT id, sku, name, game, category, set_name, rarity, condition, language, foil,
              grade_company, grade, cert_number, price, cost, stock, low_stock,
              discount_type, discount_value,
              (image IS NOT NULL AND image != '') AS has_image
       FROM products WHERE ${clauses.join(" AND ")} ORDER BY game, name LIMIT 500`
    )
    .all(...args) as any[];
}

function ProductModal({ sp, basePath, mode }: { sp: InventorySearchParams; basePath: string; mode: "all" | "single" | "graded" }) {
  const editing = sp.edit ? (getDb().prepare("SELECT * FROM products WHERE id=?").get(Number(sp.edit)) as any) : null;
  if (!sp.new && !editing) return null;
  const p = editing ?? {
    name: "", game: mode === "all" ? "Pokémon" : "Pokémon",
    category: mode === "single" ? "single" : mode === "graded" ? "graded" : "sealed",
    set_name: "", rarity: "", condition: mode === "single" ? "NM" : "", language: "EN", foil: 0,
    grade_company: mode === "graded" ? "PSA" : "", grade: "", cert_number: "", barcode: "",
    price: 0, cost: 0, stock: mode === "graded" ? 1 : 0, low_stock: mode === "graded" ? 0 : 4,
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <Link href={basePath} className="absolute inset-0 bg-black/75 animate-fadein" aria-label="Close" />
      <div className="relative card shadow-pop w-full max-w-2xl p-6 animate-rise max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg tracking-wide text-white">{editing ? "Edit Product" : "New Product"}</h2>
          <Link href={basePath} className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></Link>
        </div>
        <ProductFormClient product={p} basePath={basePath} editingId={editing?.id} action={saveProductAction} identify={identifyPhotoAction} initialUsage={getAiUsage()} />
      </div>
    </div>
  );
}

export function InventoryView({
  sp,
  basePath,
  mode,
  title,
  subtitle,
}: {
  sp: InventorySearchParams;
  basePath: string;
  mode: "all" | "single" | "graded";
  title: string;
  subtitle: string;
}) {
  const forced = mode === "single" ? "single" : mode === "graded" ? "graded" : undefined;
  const products = queryProducts(sp, forced);
  const aiUsage = getAiUsage();
  const totals = products.reduce(
    (a, p) => ({ units: a.units + p.stock, value: a.value + p.cost * p.stock, retail: a.retail + p.price * p.stock }),
    { units: 0, value: 0, retail: 0 }
  );

  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["new", "edit"].includes(k)) as [string, string][]);
  const withParam = (k: string, v: string) => {
    const n = new URLSearchParams(qs);
    n.set(k, v);
    return `${basePath}?${n.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <ReportActions section={mode === "single" ? "singles" : mode === "graded" ? "graded" : "inventory"} />
            <ScanToAddButton enrich={enrichScan} quickAdd={quickAddProductAction} identify={identifyPhotoAction} games={GAMES} initialUsage={aiUsage} />
            <Link href={withParam("new", "1")} className="btn-ghost px-4 py-2 text-sm">
              <Icon name="plus" className="w-4 h-4" /> Add manually
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-4 text-center sm:text-left">
        {[
          ["Matching SKUs", num(products.length)],
          ["Units", num(totals.units)],
          ["Cost value", money(totals.value)],
        ].map(([l, v]) => (
          <div key={l} className="card px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-fog">{l}</p>
            <p className="num text-lg text-white mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <SearchToolbar
        placeholder="Search name, SKU, cert, barcode…  or scan →"
        scan
        filters={[
          { name: "game", label: "All games", options: GAMES.map((g) => ({ value: g, label: g })) },
          ...(mode === "all"
            ? [{
                name: "category", label: "All categories",
                options: [
                  { value: "sealed", label: "Sealed" }, { value: "single", label: "Singles" },
                  { value: "graded", label: "Graded" }, { value: "accessory", label: "Accessories" },
                ],
              }]
            : []),
          { name: "stock", label: "Any stock", options: [{ value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }] },
        ]}
      />

      <div className="card overflow-x-auto animate-rise">
        <table className="tbl">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              {mode !== "all" && <th>Set</th>}
              {mode === "single" && <th>Rarity</th>}
              {mode === "single" && <th>Cond.</th>}
              {mode === "graded" && <th>Grade</th>}
              {mode === "graded" && <th>Cert</th>}
              {mode === "all" && <th>Category</th>}
              <th className="text-right">Price</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Margin</th>
              <th className="text-center">Sale</th>
              <th className="text-center">Stock</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
              return (
                <tr key={p.id}>
                  <td className="num text-fog text-[12px]">{p.sku}</td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      {p.has_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/product-image/${p.id}`} alt="" loading="lazy" className="w-9 h-9 rounded-md object-cover border border-edge shrink-0" />
                      ) : (
                        <span className="w-9 h-9 rounded-md bg-panel-2 border border-edge text-fog flex items-center justify-center shrink-0">
                          <Icon name={p.category === "graded" ? "graded" : p.category === "single" ? "card" : "inventory"} className="w-4 h-4" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-white truncate">{p.name}</span>
                        <span className="block text-[11px] text-fog">{p.game}{p.language !== "EN" ? ` · ${p.language}` : ""}{p.foil ? " · Foil" : ""}</span>
                      </span>
                    </div>
                  </td>
                  {mode !== "all" && <td className="text-mist">{p.set_name ?? "—"}</td>}
                  {mode === "single" && <td><Badge tone="gold">{p.rarity ?? "—"}</Badge></td>}
                  {mode === "single" && <td className="text-mist">{p.condition ?? "—"}</td>}
                  {mode === "graded" && (
                    <td><Badge tone="gold">{p.grade_company} {p.grade}</Badge></td>
                  )}
                  {mode === "graded" && <td className="num text-fog text-[12px]">{p.cert_number ?? "—"}</td>}
                  {mode === "all" && <td className="text-mist capitalize">{p.category}</td>}
                  <td className="num text-right text-white">{money(p.price)}</td>
                  <td className="num text-right text-fog">{money(p.cost)}</td>
                  <td className={`num text-right ${margin >= 30 ? "text-jade" : margin >= 15 ? "text-amberish" : "text-ruby"}`}>{margin.toFixed(0)}%</td>
                  <td className="text-center">
                    <form action={setProductDiscountAction} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="returnTo" value={basePath} />
                      <select name="discount_type" defaultValue={p.discount_type ?? ""} className="input !w-12 !px-1 !py-1 text-[12px] shrink-0" title="Discount type">
                        <option value="">—</option>
                        <option value="percent">%</option>
                        <option value="amount">$</option>
                      </select>
                      <input name="discount_value" type="number" min="0" step="0.01"
                        defaultValue={p.discount_type === "amount" ? (p.discount_value / 100).toFixed(2) : p.discount_type === "percent" ? p.discount_value : ""}
                        className="input num !w-14 !px-1.5 !py-1 text-[12px] shrink-0" placeholder="0" title="Discount amount" />
                      <button className="btn-ghost w-6 h-6 !rounded-md shrink-0" title="Save discount"><Icon name="check" className="w-3 h-3" /></button>
                    </form>
                  </td>
                  <td className="text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <form action={adjustStockAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="delta" value={-1} />
                        <input type="hidden" name="returnTo" value={basePath} />
                        <button className="btn-ghost w-6 h-6 !rounded-md" title="-1"><Icon name="minus" className="w-3 h-3" /></button>
                      </form>
                      <span className={`num w-8 text-center ${p.stock === 0 ? "text-ruby font-semibold" : p.stock <= p.low_stock ? "text-amberish font-semibold" : "text-white"}`}>
                        {p.stock}
                      </span>
                      <form action={adjustStockAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="delta" value={1} />
                        <input type="hidden" name="returnTo" value={basePath} />
                        <button className="btn-ghost w-6 h-6 !rounded-md" title="+1"><Icon name="plus" className="w-3 h-3" /></button>
                      </form>
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={withParam("edit", String(p.id))} className="btn-ghost w-7 h-7 !rounded-md inline-flex mr-1" title="Edit">
                      <Icon name="edit" className="w-3.5 h-3.5" />
                    </Link>
                    <form action={archiveProductAction} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="returnTo" value={basePath} />
                      <button className="btn-ghost w-7 h-7 !rounded-md text-ruby/70 hover:text-ruby" title="Archive">
                        <Icon name="trash" className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.length === 0 && <EmptyState title="No products found" hint="Adjust filters or add a new product." />}
      </div>

      <ProductModal sp={sp} basePath={basePath} mode={mode} />
    </>
  );
}
