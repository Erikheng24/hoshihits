"use client";

import { useEffect, useRef } from "react";

/**
 * Posts the signed PayWay fields to ABA's hosted checkout. Rendered on
 * /pay/payway/[id]; it submits itself on mount so the customer lands straight
 * on ABA's secure card page. A manual button is shown in case auto-submit is
 * blocked.
 */
export function PaywayAutoSubmit({ action, fields }: { action: string; fields: Record<string, string> }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const t = setTimeout(() => formRef.current?.submit(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <form ref={formRef} method="post" action={action} encType="multipart/form-data" className="text-center">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <p className="text-mist mb-4">Opening secure ABA payment…</p>
      <button type="submit" className="btn-gold px-5 py-2.5 text-sm">Continue to payment</button>
    </form>
  );
}
