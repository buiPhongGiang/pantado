import { pctS, roundPct } from "./num";
import type { IndexView } from "../screens/asset.api";
import type { IndexDetail } from "../screens/index.data";
import { until } from "../screens/index.data";

/**
 * Workspace view model (reference/index-layer/Workspace.dc.html): the indexes in scope over a period, each rebased to
 * 100 at the period start, against AVAX; their stats and rebalance state. Pure: the screen fetches, this computes.
 */

export type Scope = "Your indexes" | "Watchlist" | "All public";
export const SCOPES: Scope[] = ["Your indexes", "Watchlist", "All public"];
export type Period = 7 | 30 | 90;
export const PERIODS: Period[] = [7, 30, 90];
export const PALETTE = ["#9052F9", "#3DD68C", "#F5B14C", "#4C8DFF", "#FF8FA3", "#2FC7C0", "#D4AF37", "#C9B3FD", "#FF6B6B", "#A3E635"];

const DAY = 86_400;
const MODE_LABEL = ["Off", "Manual", "Auto"] as const;

export interface Point {
  ts: number; // seconds
  v: number;
}

/** Indexes in a scope. "Your indexes": created by the wallet (public and private); others: public only. */
export function inScope(all: IndexView[], scope: Scope, me: string | null, watch: Set<string>): IndexView[] {
  if (scope === "Your indexes") return me ? all.filter((x) => x.creator.toLowerCase() === me.toLowerCase()) : [];
  if (scope === "Watchlist") return all.filter((x) => x.isPublic && watch.has(x.id.toLowerCase()));
  return all.filter((x) => x.isPublic);
}

/**
 * The part of a series inside [start, now], starting with the value in force at `start` (the last point at or
 * before it; the first point inside when the series begins later). Empty when nothing is known by `now`.
 */
export function window_(pts: Point[], start: number, now: number): Point[] {
  const s = [...pts].filter((p) => p.ts <= now && Number.isFinite(p.v) && p.v > 0).sort((a, b) => a.ts - b.ts);
  if (!s.length) return [];
  const before = s.filter((p) => p.ts <= start);
  const inside = s.filter((p) => p.ts > start);
  const head = before.length ? [{ ts: start, v: (before[before.length - 1] as Point).v }] : [];
  return [...head, ...inside];
}

/** Rebased to 100 at the first point. */
export function rebase(pts: Point[]): Point[] {
  const b = pts[0]?.v;
  return b ? pts.map((p) => ({ ts: p.ts, v: (p.v / b) * 100 })) : [];
}

/** Last value of each UTC day (for daily returns). */
export function dailyCloses(pts: Point[]): number[] {
  const m = new Map<number, number>();
  for (const p of pts) m.set(Math.floor(p.ts / DAY), p.v);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

export interface Stats {
  ret: number | null;
  vol: number | null; // annualised, daily returns
  dd: number | null; // ≤ 0
}

export function stats(pts: Point[]): Stats {
  if (pts.length < 2) return { ret: null, vol: null, dd: null };
  const first = (pts[0] as Point).v;
  const last = (pts[pts.length - 1] as Point).v;
  let peak = first;
  let dd = 0;
  for (const p of pts) {
    peak = Math.max(peak, p.v);
    dd = Math.min(dd, p.v / peak - 1);
  }
  const c = dailyCloses(pts);
  let vol: number | null = null;
  if (c.length >= 3) {
    const r: number[] = [];
    for (let i = 1; i < c.length; i++) r.push((c[i] as number) / (c[i - 1] as number) - 1);
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    vol = Math.sqrt(r.reduce((a, b) => a + (b - m) * (b - m), 0) / r.length) * Math.sqrt(365);
  }
  return { ret: last / first - 1, vol, dd };
}

export type Tone = "good" | "warn" | "idle" | "info";
const TONE: Record<Tone, [string, string]> = { good: ["#11261B", "#3DD68C"], warn: ["#2E2311", "#F5B14C"], idle: ["#1F1F23", "#B4B4BB"], info: ["#221637", "#B18CFB"] };

/** Rebalance column and the attention rule (scheduled, due, or drift ≥ 80% of its trigger). */
export function rebalanceStatus(ix: IndexView, detail: IndexDetail | null, maxDriftBps: number | null, now: number): { text: string; tone: Tone; attention: boolean } {
  const r = detail?.rebalance;
  if (ix.model !== "data") return { text: ix.mode === 2 ? "Auto" : ix.mode === 1 ? "Manual" : "Fixed basket", tone: "idle", attention: false };
  if (!r) return { text: "—", tone: "idle", attention: false };
  if (r.pending) return { text: r.pending.at <= now ? `Version ${ix.version + 1} applying` : `Version ${ix.version + 1} in ${until(r.pending.at, now)}`, tone: "warn", attention: true };
  if (r.due !== "None") return { text: r.due === "Drop" ? "Asset to drop" : "Due now", tone: "warn", attention: true };
  if (r.mode === 2) {
    const d = maxDriftBps ?? 0;
    if (r.driftBps > 0 && d >= 0.8 * r.driftBps) return { text: `Drift ${(d / 100).toFixed(1)}% · trigger ±${(r.driftBps / 100).toFixed(0)}%`, tone: "warn", attention: true };
    return { text: "On target", tone: "good", attention: false };
  }
  return r.mode === 1 ? { text: "No version scheduled", tone: "info", attention: false } : { text: "Fixed basket", tone: "idle", attention: false };
}

export interface WorkspaceInput {
  indexes: IndexView[]; // already in scope
  levels: Record<string, Point[]>; // by index id (lower case)
  details: Record<string, IndexDetail | null>;
  drift: Record<string, number | null>; // maxDriftBps by index id
  avax: Point[]; // daily closes
  period: Period;
  hidden: Set<string>;
  now: number;
}

const pct = (v: number | null): string => pctS(v, 2);
const col = (v: number | null): string => (v === null || !Number.isFinite(v) ? "#8E8E96" : roundPct(v, 2) >= 0 ? "#3DD68C" : "#FF6B6B");
const fmtDate = (ts: number): string => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });

export function workspaceVM(x: WorkspaceInput) {
  const start = x.now - x.period * DAY;
  const avaxW = rebase(window_(x.avax, start, x.now));
  const aS = stats(avaxW);
  const data = x.indexes.map((ix, k) => {
    const id = ix.id.toLowerCase();
    const sl = rebase(window_(x.levels[id] ?? [], start, x.now));
    const st = stats(sl);
    const rb = rebalanceStatus(ix, x.details[id] ?? null, x.drift[id] ?? null, x.now);
    return { ix, id, col: PALETTE[k % PALETTE.length] as string, sl, st, rb };
  });

  // chart: shared time axis [start, now], y range over the visible lines and AVAX, on a 5 / 10 step
  const visible = data.filter((d) => !x.hidden.has(d.id) && d.sl.length > 1);
  const series = [...visible.map((d) => d.sl), ...(avaxW.length > 1 ? [avaxW] : [])];
  const vals = series.flat().map((p) => p.v);
  let lo = vals.length ? Math.min(...vals, 100) : 95;
  let hi = vals.length ? Math.max(...vals, 100) : 105;
  const step = hi - lo > 30 ? 10 : hi - lo > 8 ? 5 : 1;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const Y = (v: number): number => ((hi - v) / (hi - lo)) * 300;
  const X = (ts: number): number => ((ts - start) / (x.now - start)) * 1000;
  const thin = (p: Point[]): Point[] => (p.length <= 240 ? p : p.filter((_, i) => i % Math.ceil(p.length / 240) === 0 || i === p.length - 1));
  const pts = (p: Point[]): string => thin(p).map((q) => `${X(q.ts).toFixed(1)},${Y(q.v).toFixed(1)}`).join(" ");
  const lines = [
    ...visible.map((d) => ({ key: d.id, pts: pts(d.sl), col: d.col, sw: 2, dash: "" })),
    ...(avaxW.length > 1 ? [{ key: "avax", pts: pts(avaxW), col: "#8E8E96", sw: 1.5, dash: "5 5" }] : []),
  ];
  const ticks: { v: string; top: string; ltop: string; line: string }[] = [];
  for (let v = hi; v >= lo; v -= step) {
    const t = (Y(v) / 300) * 100;
    ticks.push({ v: String(v), top: `${t.toFixed(2)}%`, ltop: `calc(${t.toFixed(2)}% - 7px)`, line: v === 100 ? "#3A3A40" : "#17171A" });
  }

  const rows = data.map((d) => {
    const lv = Number(d.ix.level) / 1e18;
    const since = lv > 0 ? lv / 100 - 1 : null;
    const vs = d.st.ret !== null && aS.ret !== null ? d.st.ret - aS.ret : null;
    const [sbg, sfg] = TONE[d.rb.tone];
    return {
      id: d.id,
      n: d.ix.name,
      t: d.ix.ticker,
      mode: `${MODE_LABEL[d.ix.mode] ?? "Off"}${d.ix.isPublic ? "" : " · private"}`,
      col: d.col,
      lv: lv > 0 ? lv.toFixed(2) : "—",
      ret: pct(d.st.ret),
      rc: col(d.st.ret),
      vs: vs === null ? "—" : `${vs >= 0 ? "+" : ""}${(vs * 100).toFixed(1)} pts`,
      xc: col(vs),
      vol: d.st.vol === null ? "—" : `${(d.st.vol * 100).toFixed(0)}%`,
      dd: d.st.dd === null ? "—" : `${(d.st.dd * 100).toFixed(1)}%`,
      since: pct(since),
      sc: col(since),
      st: d.rb.text,
      sbg,
      sfg,
      href: `/index/${d.ix.id}`,
    };
  });

  const ranked = data.filter((d) => d.st.ret !== null).sort((a, b) => (b.st.ret ?? 0) - (a.st.ret ?? 0));
  const pick = (d: (typeof data)[number] | undefined) => ({ n: d ? d.ix.name : "—", r: d ? pct(d.st.ret) : "", c: d ? col(d.st.ret) : "#8E8E96" });
  const legend = data.map((d) => {
    const off = x.hidden.has(d.id);
    return { id: d.id, t: d.ix.ticker, col: d.col, on: !off, bg: off ? "transparent" : "#17171A", fg: off ? "#5A5A62" : "#F2F2F3" };
  });
  const rl = `${x.period}D`;
  return {
    rl,
    from: fmtDate(start),
    to: fmtDate(x.now),
    best: pick(ranked[0]),
    worst: pick(ranked.length > 1 ? ranked[ranked.length - 1] : undefined),
    bench: { r: pct(aS.ret), c: col(aS.ret), ret: aS.ret },
    beatN: aS.ret === null ? 0 : data.filter((d) => d.st.ret !== null && (d.st.ret as number) > (aS.ret as number)).length,
    count: data.length,
    attn: data.filter((d) => d.rb.attention).length,
    legend,
    lines,
    ticks,
    rows,
    hasAvax: avaxW.length > 1,
  };
}

export type WorkspaceView = ReturnType<typeof workspaceVM>;
