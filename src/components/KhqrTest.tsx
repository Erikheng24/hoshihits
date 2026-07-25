"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { testKhqrAction } from "@/app/(app)/settings/actions";

/**
 * "Test" button for the KHQR / PayWay settings — generates a sample QR so the
 * shopkeeper can confirm the config works without ringing up a real sale.
 */
export function KhqrTest() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string; image?: string } | null>(null);

  async function run() {
    setBusy(true);
    setRes(null);
    try {
      setRes(await testKhqrAction());
    } catch {
      setRes({ ok: false, message: "Test failed to run." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={run} disabled={busy} className="btn-ghost px-4 py-2 text-sm disabled:opacity-60">
        <Icon name="scan" className="w-4 h-4" /> {busy ? "Testing…" : "Test QR"}
      </button>
      {res && (
        <div className="flex items-center gap-2">
          {res.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={res.image} alt="test QR" className="w-10 h-10 rounded bg-white p-0.5" />
          )}
          <span className={`text-[12px] ${res.ok ? "text-jade" : "text-ruby"}`}>{res.message}</span>
        </div>
      )}
    </div>
  );
}
