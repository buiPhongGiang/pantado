import { pctS, roundPct } from "./num";
/**
 * Index chart page view model (reference/index-layer/Index.dc.html). Everything is read data: the level series
 * from the indexer, the basket and its prices from `/indexes/:id/composition`, the rebalance state of a data index
 * (IndexRegistry) from `/indexes/:id`. Nothing is bought or sold.
 */
import { logoOf } from "../lib/logos";
import { short } from "../lib/nav";
import { chartGeometry, levelCandles, type ChartGeom } from "../screens/index.chart";
import { changeText, dayLabel, MODE, symbolOf, until, wad, type Composition, type IndexDetail, type IndexEvent, type Levels, type Rebalances } from "../screens/index.data";
import { levelOf, volatility } from "../screens/index.vm";
import type { AssetView } from "../screens/asset.api";

export type Tf = "15m" | "1h" | "4h" | "1D" | "1W";
export const TFS: Tf[] = ["15m", "1h", "4h", "1D", "1W"];
export const TF_SEC: Record<Tf, number> = { "15m": 900, "1h": 3600, "4h": 14_400, "1D": 86_400, "1W": 604_800 };
export type ViewTab = "Composition" | "Rebalances" | "Verification";
export const VIEW_TABS: ViewTab[] = ["Composition", "Rebalances", "Verification"];
export type Access = "API" | "History" | "On-chain";
export const ACCESS: Access[] = ["API", "History", "On-chain"];

export interface BoardRow {
  id: string;
  change24h: number | null;
  change7d?: number | null;
  change30d: number | null;
}

export interface IndexViewInput {
  detail: IndexDetail | null;
  comp: Composition | null;
  levels: Levels | null;
  reb: Rebalances | null;
  txs: IndexEvent[] | null;
  assets: AssetView[];
  board: BoardRow[];
  now: number;
  me: string | null;
  tf: Tf;
  tab: ViewTab;
  access: Access;
  env: { apiUrl: string; registry: string | null; netTag: string };
}

const UPC = "#3DD68C";
const DNC = "#FF6B6B";
const GREY = "#8E8E96";
const col = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? GREY : roundPct(v, 2) >= 0 ? UPC : DNC);
export const pct = (v: number | null | undefined, dp = 2): string => pctS(v, dp);
const usd = (n: number): string => (!Number.isFinite(n) ? "—" : n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`);

/** Where an asset's price comes from, as the market shows it. */
export function priceSource(a: AssetView | undefined): { src: string; dot: string } {
  if (!a) return { src: "—", dot: GREY };
  if (a.display.chain === "hose") return { src: "Pantado Price Chain (HOSE)", dot: "#2FC7C0" };
  if (a.kind === "stock") return { src: "On-chain stock", dot: "#4C8DFF" };
  return { src: "Avalanche C-Chain", dot: "#E84142" };
}

/** Rebalance mode tag of the header. */
export function modeTag(detail: IndexDetail): string {
  const r = detail.rebalance;
  const mode = r?.mode ?? detail.mode;
  if (mode === MODE.Manual) return "Manual · creator publishes versions";
  if (mode === MODE.Auto) {
    const drift = Math.round((r?.driftBps ?? detail.driftBps) / 100);
    const days = r?.intervalSec ? Math.round(r.intervalSec / 86_400) : null;
    return days ? `Auto · ±${drift}% drift or every ${days} days` : `Auto · ±${drift}% drift`;
  }
  return "Off · weights move with prices";
}

/** Level at or before `ts` from the indexed series (null when the series starts later). */
function levelAt(levels: Levels["levels"], ts: number): number | null {
  let best: number | null = null;
  for (const p of levels) if (Number(p.ts) <= ts) best = wad(p.level);
  return best;
}

export function indexViewVM(i: IndexViewInput) {
  const { detail, comp, now } = i;
  const legs = comp?.legs ?? [];
  const series = [...(i.levels?.levels ?? [])].sort((a, b) => Number(a.ts) - Number(b.ts));
  const byExec = new Map(i.assets.filter((a) => a.execution.address).map((a) => [(a.execution.address as string).toLowerCase(), a]));
  const byId = new Map(i.assets.map((a) => [a.id, a]));
  const boardOf = new Map(i.board.map((b) => [b.id, b]));
  const assetsLite = i.assets.map((a) => ({ ...a, execution: { address: a.execution.address } }));
  const sym = (addr: string): string => symbolOf(addr, legs, assetsLite);

  const level = levelOf(detail, comp);
  const levelS = Number.isFinite(level) ? level.toFixed(2) : "—";
  const since = Number.isFinite(level) ? level / 100 - 1 : null;
  const isData = detail?.model === "data";
  const isCreator = !!detail && !!i.me && detail.creator.toLowerCase() === i.me.toLowerCase();

  // ---- chart
  const candles = levelCandles(series, [], TF_SEC[i.tf]);
  const g: ChartGeom = chartGeometry(candles, 72);
  // chartGeometry draws prices between y 60 and 400 of a 1000×520 box; this page shows that band only
  const Y0 = 40;
  const YH = 380;
  const yPct = (y: number): string => `${(((y - Y0) / YH) * 100).toFixed(2)}%`;
  const chart = {
    viewBox: `0 ${Y0} 1000 ${YH}`,
    candles: g.candles,
    grid: g.hLines.map((y, k) => ({ top: yPct(y), label: g.yLabels[k]?.text ?? "" })),
    xLabels: g.xLabels,
    last: g.last ? { top: yPct(g.last.y), text: g.last.text, col: g.last.col } : null,
    ohlc: g.ohlc,
    empty: candles.length === 0,
  };

  // ---- performance strip
  const at = (sec: number): number | null => levelAt(series, now - sec);
  const ret = (from: number | null): number | null => (from && Number.isFinite(level) ? level / from - 1 : null);
  const strip = [
    { label: "24H", v: ret(at(86_400)) },
    { label: "7D", v: ret(at(7 * 86_400)) },
    { label: "30D", v: ret(at(30 * 86_400)) },
    { label: "ALL", v: since },
  ].map((x) => ({ label: x.label, val: pct(x.v), col: col(x.v) }));
  const daily = levelCandles(series, [], 86_400).map((c) => c.c);
  const vol = volatility(daily);

  // ---- basket
  const stocksBps = legs.reduce((s, l) => s + (l.kind === "stock" ? l.targetBps : 0), 0);
  const stocks = legs.length ? Math.round(stocksBps / 100) : null;
  const compRows = legs.map((l) => {
    const a = (l.id ? byId.get(l.id) : undefined) ?? byExec.get(l.asset.toLowerCase());
    const b = a ? boardOf.get(a.id) : undefined;
    const ps = priceSource(a);
    return {
      t: a?.displaySymbol ?? l.symbol ?? short(l.asset),
      k: a ? (a.display.chain === "hose" ? "VN Stock" : a.kind === "stock" ? "Stock" : "Token") : "",
      img: logoOf(a?.id ?? l.id),
      color: a?.color ?? GREY,
      w: `${(l.targetBps / 100).toFixed(0)}%`,
      px: usd(wad(l.priceWad)),
      fresh: l.fresh,
      d: pct(b?.change24h ?? null, 1),
      c1: col(b?.change24h ?? null),
      m: pct(b?.change30d ?? null, 1),
      c30: col(b?.change30d ?? null),
      src: ps.src,
      dot: ps.dot,
      href: a ? `/asset/${a.id}` : null,
    };
  });

  // ---- rebalance state (data index) → banner
  const r = detail?.rebalance;
  let banner: { pill: string; text: string } | null = null;
  if (detail && r?.pending) {
    const p = r.pending;
    const cur = detail.assets.map((a) => a.toLowerCase());
    const same = p.assets.length === cur.length && p.assets.every((a, k) => a.toLowerCase() === cur[k]);
    const text = same
      ? changeText(cur.map(sym), detail.targetBps, p.weightsBps)
      : p.assets.map((a, k) => `${sym(a)} ${Math.round((p.weightsBps[k] ?? 0) / 100)}%`).join(" · ");
    banner = { pill: p.at <= now ? `Version ${detail.version + 1} applying` : `Version ${detail.version + 1} in ${until(p.at, now)}`, text: `${text}${p.reason ? ` · ${p.reason}` : ""}` };
  } else if (r && r.mode === MODE.Auto && r.due === "Auto") {
    banner = { pill: "Auto rebalance due", text: `Back to targets at the next poke · largest drift ${(Number(comp?.maxDriftBps ?? 0) / 100).toFixed(1)}%` };
  } else if (r && r.due === "Drop") {
    banner = { pill: "Asset leaving", text: "An asset is delisted or has no price: it is dropped at its last price and its weight goes to the others." };
  }

  // ---- events per tab
  const events: { when: string; what: string; ref: string }[] = [];
  if (i.tab === "Rebalances" && detail) {
    if (r?.pending) events.push({ when: dayLabel(r.pending.at), what: `Version ${detail.version + 1} scheduled: ${banner?.text ?? ""}`, ref: "scheduled" });
    const vers = [...(i.reb?.versions ?? [])].sort((a, b) => b.version - a.version);
    for (const v of vers) events.push({ when: dayLabel(Number(v.ts)), what: `Version ${v.version}: ${v.targetBps.map((w, k) => `${sym(detail.assets[k] ?? "")} ${Math.round(w / 100)}%`).join(" · ")}${v.reason ? ` · ${v.reason}` : ""}`, ref: `v${v.version}` });
    for (const e of i.txs ?? []) {
      if (e.kind === "cancelled") events.push({ when: dayLabel(Number(e.ts)), what: "Scheduled version cancelled", ref: e.txHash.slice(0, 10) });
      if (e.kind === "visibility") events.push({ when: dayLabel(Number(e.ts)), what: "Made public", ref: e.txHash.slice(0, 10) });
    }
    events.push({ when: dayLabel(Number(detail.createdAt)), what: "Index created at level 100.00", ref: "v1" });
  }
  if (i.tab === "Verification" && detail) {
    const idx = wad(detail.level);
    const live = wad(comp?.level);
    const blk = (detail as IndexDetail & { levelBlock?: string }).levelBlock ?? series[series.length - 1]?.block ?? null;
    const diff = Number.isFinite(idx) && Number.isFinite(live) ? Math.abs(idx - live) : null;
    events.push({ when: "Indexer", what: `Level ${Number.isFinite(idx) ? idx.toFixed(4) : "—"} at its last price update`, ref: blk ? `#${Number(blk).toLocaleString("en-US")}` : "—" });
    events.push({ when: "Recomputed", what: `Σ units × last published price = ${Number.isFinite(live) ? live.toFixed(4) : "—"} (latest block)`, ref: isData ? "IndexRegistry" : "IndexLens" });
    events.push({
      when: "Difference",
      what: diff === null ? "—" : diff < 0.0001 ? "Same level from both reads" : `${diff.toFixed(4)}: the indexer catches up at the next price push`,
      ref: diff === null ? "—" : diff < 0.0001 ? "match" : "behind",
    });
    events.push({ when: "Prices", what: comp?.allFresh ? "Every price in the basket is fresh" : "A price in the basket is out of date", ref: comp?.allFresh ? "fresh" : "stale" });
  }

  // ---- use this data
  const id = detail?.id ?? "";
  const lastBlock = series[series.length - 1]?.block ?? null;
  const DT: Record<Access, { kind: string; code: string; note: string; cta: string }> = {
    API: { kind: "REST · GET", code: `${i.env.apiUrl}/indexes/${id}`, note: "Level, rebalance state and basket. Composition at /composition.", cta: "Copy request" },
    History: { kind: "REST · GET", code: `${i.env.apiUrl}/indexes/${id}/levels?limit=500`, note: "Level history for charts, one point per block that moved it.", cta: "Copy request" },
    "On-chain": {
      kind: `SOLIDITY · ${i.env.netTag.toUpperCase()}`,
      code: isData && i.env.registry ? `IndexRegistry(${i.env.registry}).levelOf(${id})\n// ${Number.isFinite(level) ? level.toFixed(4) : "—"}e18` : `IndexLens.level(${id})\n// ${Number.isFinite(level) ? level.toFixed(4) : "—"}e18`,
      note: "Read the same number from your own contract.",
      cta: "Copy call",
    },
  };
  const dcur = DT[i.access];

  return {
    ready: !!detail,
    name: detail?.name ?? "—",
    ticker: detail?.ticker ?? "",
    by: detail ? short(detail.creator) : "",
    description: detail?.description ?? "",
    netTag: `Indexed on ${i.env.netTag}`,
    modeTag: detail ? modeTag(detail) : "",
    isPrivate: detail ? !detail.isPublic : false,
    isCreator,
    canEdit: isCreator && isData,
    banner,
    chart,
    tfs: TFS.map((t) => ({ label: t, on: t === i.tf })),
    tabs: VIEW_TABS.map((t) => ({ label: t, on: t === i.tab })),
    showComp: i.tab === "Composition",
    compRows,
    events,
    levelS,
    sinceS: pct(since),
    sinceCol: col(since),
    stats: [
      { label: "VERSION", val: detail ? String(detail.version) : "—" },
      { label: "ASSETS", val: legs.length ? String(legs.length) : detail ? String(detail.assets.length) : "—" },
      { label: "VOLATILITY", val: vol === null ? "—" : `${Math.round(vol * 100)}%` },
    ],
    strip,
    share: stocks === null ? null : { stocks, tokens: 100 - stocks },
    access: ACCESS.map((a) => ({ label: a, on: a === i.access })),
    dkind: dcur.kind,
    dcode: dcur.code,
    dnote: dcur.note,
    dcta: dcur.cta,
    dv1: Number.isFinite(level) ? level.toFixed(4) : "—",
    dv2: lastBlock ? `#${Number(lastBlock).toLocaleString("en-US")}` : "—",
    dcheck: comp ? (comp.allFresh ? "Every basket price is fresh" : "A basket price is out of date") : "Reading the basket…",
    dfresh: comp?.allFresh ?? false,
  };
}

export type IndexViewVM = ReturnType<typeof indexViewVM>;
