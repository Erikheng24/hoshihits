/**
 * The shop runs on Cambodia time (ICT, UTC+7, no daylight saving).
 *
 * Hosting providers run their containers in UTC, which made every stored
 * timestamp — receipts, sales, reports — 7 hours behind the actual time in
 * Phnom Penh. Two things read the clock and both must agree:
 *
 *   1. JavaScript `new Date()` — fixed by pinning the process timezone below.
 *   2. SQLite date math — the queries use the `SHOP_NOW` modifier instead of
 *      SQLite's own 'localtime', because 'localtime' reads the platform C
 *      library (unreliable on Windows dev machines and dependent on the host),
 *      whereas a fixed +7h offset is correct in every environment.
 *
 * Override with the TZ env var if the shop ever moves to another timezone.
 */
export const SHOP_TZ = process.env.TZ || "Asia/Phnom_Penh";

if (process.env.TZ !== SHOP_TZ) process.env.TZ = SHOP_TZ;

/** Use in place of `'now','localtime'` inside SQLite date()/datetime()/strftime(). */
export const SHOP_NOW = "'now','+7 hours'";
