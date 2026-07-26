import Script from "next/script";
import { PayProof } from "./PayProof";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment Photo" };

/** Telegram Web App page — opened from the bot's "Submit payment photo" button. */
export default function PayProofPage({ searchParams }: { searchParams: { order?: string } }) {
  const order = (searchParams.order ?? "").trim();
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <PayProof order={order} />
    </>
  );
}
