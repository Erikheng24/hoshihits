import { NextResponse } from "next/server";
import { webhookSecret, answerCallback, sendMessageTo, getTelegramConfig } from "@/lib/providers/telegram";
import { sendCustomerOrder, handlePaidClaim, handleContact, handlePaymentPhoto } from "@/lib/shop-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram bot webhook. Telegram POSTs every update here (verified with a secret
 * header). We handle the /start<order> deep link, the "I've paid" / "Contact
 * admin" buttons, and a /id helper so the owner can find their chat ID.
 */
export async function POST(req: Request) {
  // Verify the request really comes from Telegram.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: any = null;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    // Button taps.
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const data: string = cq.data ?? "";
      await answerCallback(cq.id);
      if (chatId) {
        if (data.startsWith("paid:")) await handlePaidClaim(chatId, data.slice(5));
        else if (data.startsWith("contact:")) await handleContact(chatId, data.slice(8));
      }
      return NextResponse.json({ ok: true });
    }

    // Messages.
    const msg = update.message ?? update.edited_message;
    const chatId = msg?.chat?.id;
    const text: string = (msg?.text ?? "").trim();
    if (!chatId) return NextResponse.json({ ok: true });

    // A photo (or a photo sent as a file) = payment proof → forward to the shop.
    const photoId: string | undefined =
      (Array.isArray(msg?.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1]?.file_id : undefined) ||
      (msg?.document?.mime_type?.startsWith?.("image/") ? msg.document.file_id : undefined);
    if (photoId) {
      await handlePaymentPhoto(chatId, photoId);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/start")) {
      const payload = text.split(/\s+/)[1] ?? "";
      if (payload) {
        await sendCustomerOrder(chatId, payload);
      } else {
        await sendMessageTo(chatId, "👋 Welcome! Browse and order from our shop, then tap <b>Order now</b> and I'll bring your order here to pay.");
      }
    } else if (text.startsWith("/id")) {
      // Helper so the shop owner can capture their chat ID for Settings.
      await sendMessageTo(chatId, `Your chat ID is: <code>${chatId}</code>`);
    } else {
      const link = getTelegramConfig().adminUsername ? `https://t.me/${getTelegramConfig().adminUsername}` : null;
      await sendMessageTo(chatId, link ? `Need help? Message our team: ${link}` : "Thanks for your message — our team will get back to you. 🙏");
    }
  } catch {
    /* never fail the webhook — Telegram would retry endlessly */
  }
  return NextResponse.json({ ok: true });
}
