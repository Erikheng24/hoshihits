"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { connectBotAction } from "@/app/(app)/settings/actions";

/**
 * One-click "Connect bot" — registers the Telegram webhook so the bot can chat
 * with customers (show the order, payment QR and buttons). Run once after saving
 * the bot token, and again if you change your site URL.
 */
export function ConnectBot() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setBusy(true);
    setRes(null);
    try {
      setRes(await connectBotAction());
    } catch {
      setRes({ ok: false, message: "Couldn't connect the bot." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button type="button" onClick={run} disabled={busy} className="btn-gold px-4 py-2 text-sm disabled:opacity-60">
        <Icon name="check" className="w-4 h-4" /> {busy ? "Connecting…" : "Connect bot to shop"}
      </button>
      {res && <span className={`text-[12px] ${res.ok ? "text-jade" : "text-ruby"}`}>{res.message}</span>}
    </div>
  );
}
