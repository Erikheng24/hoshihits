"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children directly into <body>.
 *
 * Needed for overlays: any ancestor with a `transform`, `filter` or
 * `backdrop-filter` becomes the containing block for `position: fixed`
 * descendants, which clips full-screen modals to that element. Several of our
 * wrappers animate with translateY, so modals must escape the tree entirely.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
