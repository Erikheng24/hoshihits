export const dynamic = "force-dynamic";

/** Where ABA PayWay returns after a card payment. The POS has already detected
 *  the result and printed the receipt, so this is just a friendly full-stop. */
export default function PaywayDonePage() {
  return (
    <div className="min-h-screen bg-ink text-white flex items-center justify-center p-6 text-center">
      <div className="card p-8 max-w-sm w-full">
        <div className="w-16 h-16 rounded-full bg-jade/15 border-2 border-jade grid place-items-center mx-auto mb-5">
          <svg viewBox="0 0 24 24" className="w-9 h-9 text-jade" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="text-xl font-semibold">Thank you</p>
        <p className="text-mist mt-2 text-sm">Payment complete — you can close this window. Your receipt is being printed.</p>
      </div>
    </div>
  );
}
