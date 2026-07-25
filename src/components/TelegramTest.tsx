"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { testTelegramAction } from "@/app/(app)/settings/actions";

/** "Test" button for the storefront's Telegram bot — sends a test message. */
export function TelegramTest() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setBusy(true);
    setRes(null);
    try {
      setRes(await testTelegramAction());
    } catch {
      setRes({ ok: false, message: "Test failed to run." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button type="button" onClick={run} disabled={busy} className="btn-ghost px-4 py-2 text-sm disabled:opacity-60">
        <Icon name="check" className="w-4 h-4" /> {busy ? "Sending…" : "Test Telegram"}
      </button>
      {res && <span className={`text-[12px] ${res.ok ? "text-jade" : "text-ruby"}`}>{res.message}</span>}
    </div>
  );
}
