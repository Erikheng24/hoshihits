"use client";

import { useMemo, useRef, useState } from "react";

// Validated dark-surface chart palette (dataviz six-checks pass):
export const SERIES_GOLD = "#B08A24";
export const SERIES_BLUE = "#4A8FE7";
const GRID = "rgba(255,255,255,0.06)";
const AXIS_TEXT = "#6b6b6b";

/** Charts render before any data exists (a brand-new store), so never assume points. */
function NoData({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-fog text-sm" style={{ height }}>
      No data for this period yet.
    </div>
  );
}

function fmtMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export interface Pt {
  label: string;      // axis label ("Jul 4")
  value: number;      // cents
  value2?: number;    // optional second series (cents)
}

/** Single- or two-series line/area chart with crosshair + tooltip. */
export function LineChart({
  data,
  height = 240,
  series1 = "Revenue",
  series2,
  isMoney = true,
}: {
  data: Pt[];
  height?: number;
  series1?: string;
  series2?: string;
  isMoney?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const pad = { l: 46, r: 12, t: 14, b: 24 };

  const { max, path1, path2, area1, xs } = useMemo(() => {
    if (!data.length) return { max: 1, path1: "", path2: null, area1: "", xs: [] as number[] };
    const rawMax = Math.max(1, ...data.map((d) => Math.max(d.value, d.value2 ?? 0)));
    const max = niceMax(rawMax * 1.05);
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const xs = data.map((_, i) => pad.l + (data.length === 1 ? iw / 2 : (i * iw) / (data.length - 1)));
    const y = (v: number) => pad.t + ih - (v / max) * ih;
    const line = (get: (d: Pt) => number) =>
      data.map((d, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${y(get(d)).toFixed(1)}`).join(" ");
    const path1 = line((d) => d.value);
    const path2 = data.some((d) => d.value2 !== undefined) ? line((d) => d.value2 ?? 0) : null;
    const area1 = `${path1} L${xs[xs.length - 1].toFixed(1)},${(pad.t + ih).toFixed(1)} L${xs[0].toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;
    return { max, path1, path2, area1, xs };
  }, [data, H]);

  const ih = H - pad.t - pad.b;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  if (!data.length) return <NoData height={H} />;

  function onMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    xs.forEach((x, i) => {
      const d = Math.abs(x - px);
      if (d < bd) { bd = d; best = i; }
    });
    setHover(best);
  }

  const h = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series1 + (series2 ? ` vs ${series2}` : "") + " chart"}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill={AXIS_TEXT} className="num">
              {isMoney ? fmtMoney(t) : Math.round(t)}
            </text>
          </g>
        ))}
        <defs>
          <linearGradient id="goldArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_GOLD} stopOpacity="0.28" />
            <stop offset="100%" stopColor={SERIES_GOLD} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area1} fill="url(#goldArea)" />
        <path d={path1} fill="none" stroke={SERIES_GOLD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {path2 && <path d={path2} fill="none" stroke={SERIES_BLUE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={xs[i]} y={H - 6} textAnchor="middle" fontSize="10.5" fill={AXIS_TEXT}>
              {d.label}
            </text>
          ) : null
        )}

        {h && hover !== null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={pad.t} y2={pad.t + ih} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={xs[hover]} cy={y(h.value)} r="4.5" fill={SERIES_GOLD} stroke="#151515" strokeWidth="2" />
            {h.value2 !== undefined && <circle cx={xs[hover]} cy={y(h.value2)} r="4.5" fill={SERIES_BLUE} stroke="#151515" strokeWidth="2" />}
          </g>
        )}
      </svg>

      {h && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 card px-3 py-2 text-xs shadow-pop"
          style={{
            left: `${(xs[hover] / W) * 100}%`,
            top: 0,
            transform: `translateX(${xs[hover] > W * 0.7 ? "-108%" : "8%"})`,
          }}
        >
          <p className="text-fog mb-1">{h.label}</p>
          <p className="flex items-center gap-1.5 text-white num">
            <span className="w-2 h-2 rounded-full" style={{ background: SERIES_GOLD }} />
            {series1}: {isMoney ? fmtMoney(h.value) : h.value}
          </p>
          {h.value2 !== undefined && series2 && (
            <p className="flex items-center gap-1.5 text-white num mt-0.5">
              <span className="w-2 h-2 rounded-full" style={{ background: SERIES_BLUE }} />
              {series2}: {isMoney ? fmtMoney(h.value2) : h.value2}
            </p>
          )}
        </div>
      )}

      {series2 && (
        <div className="flex items-center gap-4 px-1 pt-2 text-[11px] text-mist">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES_GOLD }} />{series1}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES_BLUE }} />{series2}</span>
        </div>
      )}
    </div>
  );
}

/** Vertical bars, rounded data-end, per-bar hover tooltip. */
export function BarChart({
  data,
  height = 220,
  isMoney = true,
  color = SERIES_GOLD,
}: {
  data: { label: string; value: number }[];
  height?: number;
  isMoney?: boolean;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const pad = { l: 46, r: 8, t: 12, b: 24 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)) * 1.05);
  const empty = data.length === 0;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = Math.min(44, (iw / Math.max(1, data.length)) * 0.62);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  if (empty) return <NoData height={H} />;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill={AXIS_TEXT} className="num">
              {isMoney ? fmtMoney(t) : Math.round(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + ((i + 0.5) * iw) / data.length;
          const bh = Math.max(2, (d.value / max) * ih);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - (iw / data.length) / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" />
              <path
                d={`M${cx - bw / 2},${pad.t + ih} V${pad.t + ih - bh + 4} Q${cx - bw / 2},${pad.t + ih - bh} ${cx - bw / 2 + 4},${pad.t + ih - bh} H${cx + bw / 2 - 4} Q${cx + bw / 2},${pad.t + ih - bh} ${cx + bw / 2},${pad.t + ih - bh + 4} V${pad.t + ih} Z`}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
                style={{ transition: "opacity .15s ease" }}
              />
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="10.5" fill={AXIS_TEXT}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 card px-3 py-1.5 text-xs shadow-pop"
          style={{ left: `${(((hover + 0.5) / data.length) * iw + pad.l) / W * 100}%`, top: 0, transform: "translateX(-50%)" }}
        >
          <span className="text-fog">{data[hover].label}: </span>
          <span className="text-white num">{isMoney ? fmtMoney(data[hover].value) : data[hover].value}</span>
        </div>
      )}
    </div>
  );
}

/** Tiny sparkline for stat tiles (non-interactive by design). */
export function Sparkline({ data, width = 120, height = 34, color = SERIES_GOLD }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 3 - ((v - min) / range) * (height - 6)}`);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[34px]" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
