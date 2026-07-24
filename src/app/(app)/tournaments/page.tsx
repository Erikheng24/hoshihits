import Link from "next/link";
import { ReportActions } from "@/components/ReportActions";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, num, shortDate } from "@/lib/format";
import { PageHeader, StatusBadge, StatCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createTournamentAction, adjustRegistrationAction, setTournamentStatusAction } from "./actions";
import { GAMES } from "@/components/InventoryView";

export const dynamic = "force-dynamic";

export default function TournamentsPage({ searchParams }: { searchParams: { new?: string } }) {
  requireModule("tournaments");
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT * FROM tournaments
       ORDER BY CASE status WHEN 'upcoming' THEN 0 ELSE 1 END, date ASC`
    )
    .all() as any[];
  const upcoming = rows.filter((r) => r.status === "upcoming");
  const totalRegistered = upcoming.reduce((a, r) => a + r.registered, 0);
  const expectedFees = upcoming.reduce((a, r) => a + r.registered * r.entry_fee, 0);

  return (
    <>
      <PageHeader
        title="Tournaments"
        subtitle="Weekly events, registration, and entry fees."
        actions={
          <>
            <ReportActions section="tournaments" />
            <Link href="/tournaments?new=1" className="btn-gold px-4 py-2 text-sm">
              <Icon name="plus" className="w-4 h-4" /> Schedule event
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5 stagger">
        <StatCard label="Upcoming Events" value={num(upcoming.length)} />
        <StatCard label="Players Registered" value={num(totalRegistered)} />
        <StatCard label="Expected Entry Fees" value={money(expectedFees)} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
        {rows.map((t) => {
          const fill = t.capacity ? Math.min(100, (t.registered / t.capacity) * 100) : 0;
          const active = t.status === "upcoming";
          return (
            <div key={t.id} className={`card card-hover p-5 ${!active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white font-medium leading-snug">{t.name}</p>
                  <p className="text-[12px] text-fog mt-0.5">{t.game} · {shortDate(t.date)}{t.time ? ` · ${t.time}` : ""}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-fog">Registration</span>
                  <span className="num text-mist">{t.registered}/{t.capacity}</span>
                </div>
                <div className="h-1.5 rounded-full bg-edge overflow-hidden">
                  <div className={`h-full rounded-full ${fill >= 100 ? "bg-jade" : "bg-gold/70"}`} style={{ width: `${fill}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 text-[12px] text-fog">
                <span>Entry {money(t.entry_fee)}</span>
                {t.prize && <span className="truncate max-w-[160px]" title={t.prize}>🏆 {t.prize}</span>}
              </div>

              {active && (
                <div className="flex items-center gap-2 mt-4">
                  <form action={adjustRegistrationAction} className="flex-1">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="delta" value={1} />
                    <button className="btn-gold w-full py-1.5 text-[12px]" disabled={t.registered >= t.capacity}>
                      <Icon name="plus" className="w-3.5 h-3.5" /> Register player
                    </button>
                  </form>
                  <form action={adjustRegistrationAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="delta" value={-1} />
                    <button className="btn-ghost w-8 h-8" title="Remove player"><Icon name="minus" className="w-3.5 h-3.5" /></button>
                  </form>
                  <form action={setTournamentStatusAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value="completed" />
                    <button className="btn-ghost w-8 h-8 text-jade" title="Mark completed"><Icon name="check" className="w-3.5 h-3.5" /></button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {rows.length === 0 && <div className="card"><EmptyState icon="tournament" title="No events scheduled" /></div>}

      {searchParams.new && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <Link href="/tournaments" className="absolute inset-0 bg-black/75 animate-fadein" aria-label="Close" />
          <div className="relative card shadow-pop w-full max-w-md p-6 animate-rise">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">Schedule Event</h2>
              <Link href="/tournaments" className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></Link>
            </div>
            <form action={createTournamentAction} className="space-y-4">
              <label className="field"><span>Event name *</span><input name="name" required className="input" placeholder="One Piece Saturday Standard" /></label>
              <label className="field"><span>Game *</span>
                <select name="game" required className="input">{GAMES.filter((g) => g !== "Accessories").map((g) => <option key={g}>{g}</option>)}</select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field"><span>Date *</span><input name="date" type="date" required className="input num" /></label>
                <label className="field"><span>Start time</span><input name="time" type="time" className="input num" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="field"><span>Entry fee ($)</span><input name="entry_fee" type="number" step="0.01" min="0" className="input num" /></label>
                <label className="field"><span>Capacity</span><input name="capacity" type="number" min="2" defaultValue={16} className="input num" /></label>
              </div>
              <label className="field"><span>Prizes</span><input name="prize" className="input" placeholder="Packs by standing + playmat" /></label>
              <div className="flex justify-end gap-2">
                <Link href="/tournaments" className="btn-ghost px-4 py-2 text-sm">Cancel</Link>
                <button className="btn-gold px-5 py-2 text-sm">Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
