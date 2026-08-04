/**
 * Pull a grading cert number out of whatever a slab's QR / barcode decodes to.
 * PSA QRs are like "https://www.psacard.com/cert/12345678"; CGC/BGS embed the
 * number too. Falls back to the longest digit run, then the raw text.
 */
export function extractCert(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const afterCert = s.match(/cert(?:ification)?[^0-9]{0,4}(\d{5,})/i);
  if (afterCert) return afterCert[1];
  const nums = s.match(/\d{5,}/g);
  if (nums) return nums.sort((a, b) => b.length - a.length)[0];
  return s;
}
