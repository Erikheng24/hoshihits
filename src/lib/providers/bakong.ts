import "server-only";
import { getKhqrConfig } from "@/lib/khqr";

/**
 * Ask Bakong (the National Bank of Cambodia Open API) whether a KHQR has been
 * paid, by its md5. Needs a Bakong Open API token (free, from the Bakong
 * developer portal) set in Settings.
 *
 *   responseCode 0            → the transaction was found = PAID
 *   responseCode 1 (not found)→ not paid yet = PENDING
 *   token/auth errors         → configuration problem, surfaced to the user
 */
export type BakongStatus = "paid" | "pending" | "error";
export interface BakongCheck {
  status: BakongStatus;
  message?: string;
}

const ENDPOINT = "https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5";

export async function checkKhqrPaid(md5: string): Promise<BakongCheck> {
  const { token } = getKhqrConfig();
  if (!token) {
    return { status: "error", message: "No Bakong API token set — add it in Settings to auto-detect payment." };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ md5 }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => null)) as
      | { responseCode?: number; responseMessage?: string; errorCode?: number }
      | null;
    if (!data) return { status: "error", message: "No response from Bakong." };

    if (data.responseCode === 0) return { status: "paid" };

    const msg = String(data.responseMessage ?? "");
    // errorCode 6 = token missing/invalid; unauthorized wording = expired token.
    if (data.errorCode === 6 || /unauthor|token|invalid/i.test(msg)) {
      return { status: "error", message: "Bakong token is missing or expired — update it in Settings." };
    }
    // Anything else (typically "Transaction could not be found") = not paid yet.
    return { status: "pending", message: msg };
  } catch {
    return { status: "error", message: "Couldn't reach Bakong — check the internet connection." };
  }
}
