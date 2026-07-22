import Link from "next/link";
import { Icon } from "./icons";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] sm:text-2xl tracking-[0.06em] text-white">{title}</h1>
          {subtitle && <p className="text-fog text-sm mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="gold-rule mt-4" />
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  gold: "bg-gold/12 text-gold-soft border border-gold/30",
  green: "bg-jade/10 text-jade border border-jade/25",
  red: "bg-ruby/10 text-ruby border border-ruby/25",
  blue: "bg-sky2/10 text-sky2 border border-sky2/25",
  amber: "bg-amberish/10 text-amberish border border-amberish/25",
  gray: "bg-white/5 text-mist border border-edge",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return <span className={`badge ${BADGE_TONES[tone] ?? BADGE_TONES.gray}`}>{children}</span>;
}

export const STATUS_TONE: Record<string, keyof typeof BADGE_TONES> = {
  completed: "green", received: "green", collected: "green", ready: "gold", arrived: "blue",
  pending: "amber", ordered: "blue", in_transit: "blue", customs: "amber", processing: "gray",
  draft: "gray", cancelled: "red", refunded: "red", upcoming: "gold", active: "green", inactive: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{status.replace(/_/g, " ").toUpperCase()}</Badge>;
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: string;
  trend?: { dir: "up" | "down"; text: string; good?: boolean };
  href?: string;
}) {
  const inner = (
    <div className="card card-hover p-4 sm:p-5 h-full">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-fog">{label}</p>
        {icon && (
          <span className="w-8 h-8 rounded-lg bg-gold/8 border border-gold/20 text-gold flex items-center justify-center shrink-0">
            <Icon name={icon} className="w-4 h-4" />
          </span>
        )}
      </div>
      <p className="num text-[26px] sm:text-[28px] font-semibold text-white mt-2 leading-none">{value}</p>
      <div className="flex items-center gap-2 mt-2.5 min-h-[18px]">
        {trend && (
          <span className={`inline-flex items-center gap-0.5 text-[12px] num font-medium ${trend.good !== false ? "text-jade" : "text-ruby"}`}>
            <Icon name={trend.dir === "up" ? "arrowUp" : "arrowDown"} className="w-3 h-3" />
            {trend.text}
          </span>
        )}
        {sub && <span className="text-[12px] text-fog">{sub}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

export function EmptyState({ icon = "search", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="py-16 text-center">
      <span className="inline-flex w-12 h-12 rounded-2xl border border-edge bg-panel-2 text-fog items-center justify-center mb-4">
        <Icon name={icon} className="w-5 h-5" />
      </span>
      <p className="text-mist">{title}</p>
      {hint && <p className="text-fog text-sm mt-1">{hint}</p>}
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          {title && <h2 className="text-[13px] uppercase tracking-[0.16em] text-mist font-medium">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
