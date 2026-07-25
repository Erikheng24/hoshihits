import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { paywayCardForm } from "@/lib/providers/payway";
import { PaywayAutoSubmit } from "@/components/PaywayAutoSubmit";

export const dynamic = "force-dynamic";

/**
 * Card checkout hop: builds the signed PayWay purchase form for this pending
 * payment and forwards the customer to ABA's hosted card page. The POS is
 * polling in the background, so the receipt prints once ABA approves.
 */
export default function PaywayCheckoutPage({ params }: { params: { id: string } }) {
  requireModule("pos");
  const row = getDb()
    .prepare("SELECT id, ref, amount, channel, status FROM payments WHERE id = ?")
    .get(Number(params.id)) as { id: number; ref: string; amount: number; channel: string; status: string } | undefined;
  if (!row || row.channel !== "card") notFound();

  const form = row.status === "pending" ? paywayCardForm(row.ref, row.amount, `Sale ${row.ref}`) : null;

  return (
    <div className="min-h-screen bg-ink text-white flex items-center justify-center p-6">
      <div className="card p-8 max-w-sm w-full text-center">
        {form ? (
          <PaywayAutoSubmit action={form.action} fields={form.fields} />
        ) : (
          <p className="text-mist">This payment is no longer open.</p>
        )}
      </div>
    </div>
  );
}
