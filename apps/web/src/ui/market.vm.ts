import { roundPct } from "./num";
import { logoOf } from "../lib/logos";
import { money, smallDp, tinyNum, vol } from "../lib/fmt";

/**
 * Market (reference/index-layer/Main.dc.html): every public index and listed asset in one table, with the top
 * mover of each type. Pure: the screen passes `/board`, `/assets`, `/indexes`, the watchlist and the sparklines.
 */

/** `/board` row (indexes carry `level` and `stocksPct`; assets carry `price`). */
export interface BoardRow {
  id: string;
  kind: "stock" | "token" | "index";
  symbol: string;
  name: string;
  color?: string;
  stocksPct?: number;
  level?: number;
  price?: { usd: number; fresh?: boolean } | null;
  change24h: number | null;
  change7d?: number | null;
  change30d?: number | null;
  volume24hUsd?: number;
}

/** `/assets` row: only what classifies and searches an asset. */
export interface AssetLite {
  id: string;
  displaySymbol?: string;
  display: { chain: string; address: string | null };
  execution: { address: string | null };
}

/** `/indexes` row: only what the index subtitle needs. */
export interface IndexLite {
  id: string;
  ticker: string;
  mode: number;
  assets: string[];
  isPublic: boolean;
}

export type MarketType = "Index" | "Stock" | "VN Stock" | "Token";
export type Filter = "All" | "Watchlist" | "Indexes" | "Stocks" | "VN Stocks" | "Tokens";
export const FILTERS: Filter[] = ["All", "Watchlist", "Indexes", "Stocks", "VN Stocks", "Tokens"];
const ORDER: MarketType[] = ["Index", "Stock", "VN Stock", "Token"];
const MODE = ["Off", "Manual", "Auto"];

const TYPE_STYLE: Record<MarketType, { tbg: string; tfg: string }> = {
  Index: { tbg: "#221637", tfg: "#B18CFB" },
  Stock: { tbg: "#1C1C20", tfg: "#B4B4BB" },
  "VN Stock": { tbg: "#10262A", tfg: "#2FC7C0" },
  Token: { tbg: "#1C1C20", tfg: "#B4B4BB" },
};
const HALF = "linear-gradient(90deg, #F2F2F3 50%, #9052F9 50%)";

export interface MarketItem {
  key: string; // watchlist key: index id (lower case) or asset id
  type: MarketType;
  n: string;
  sub: string;
  px: string;
  href: string;
  search: string;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  volume: number;
  /** volume label when not USD (VN stocks in đồng) */
  volS?: string;
  icon: string; // index swatch
  img: string; // asset logo
  ini: string; // initials when no logo
}

/** Index swatch from its stock share: mostly stocks white, mostly tokens purple, mixed half and half. */
export function swatch(stocksPct: number | undefined): string {
  const s = stocksPct ?? 50;
  return s >= 65 ? "#F2F2F3" : s <= 35 ? "#9052F9" : HALF;
}

/** USD price; sub-cent prices keep 4 significant digits. */
export function priceS(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  if (usd > 0 && usd < 0.01) return `$${tinyNum(usd) ?? usd.toFixed(smallDp(usd))}`;
  return money(usd);
}

export function pctS(v: number | null, dp: number): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const r = roundPct(v, dp);
  return `${r >= 0 ? "+" : ""}${r.toFixed(dp)}%`;
}
const col = (v: number | null): string => (v === null || !Number.isFinite(v) ? "#8E8E96" : roundPct(v, 2) >= 0 ? "#3DD68C" : "#FF6B6B");

/** "96,500 ₫" (prices round to 50 ₫ like HOSE ticks above 10,000; whole đồng below). */
export function vndS(usd: number | null | undefined, rate: number): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  const v = usd * rate;
  const r = v >= 10_000 ? Math.round(v / 50) * 50 : Math.round(v);
  return `${r.toLocaleString("en-US")} ₫`;
}

/** "412.6B ₫" / "85.0M ₫" for a VN stock's 24h volume. */
export function vndVol(usd: number, rate: number): string {
  const v = usd * rate;
  if (!(v > 0)) return "0 ₫";
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T ₫`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B ₫`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M ₫`;
  return `${Math.round(v).toLocaleString("en-US")} ₫`;
}

/**
 * One item per public index and listed asset, in the design's order (indexes, stocks, VN stocks, tokens), each type by
 * 24h volume. `vndPerUsd` (GET /fx) shows VN stocks in đồng; null keeps USD.
 */
export function marketItems(board: BoardRow[], assets: AssetLite[], indexes: IndexLite[], vndPerUsd: number | null = null): MarketItem[] {
  const aById = new Map(assets.map((a) => [a.id, a]));
  const ixById = new Map(indexes.map((x) => [x.id.toLowerCase(), x]));
  const out: MarketItem[] = [];
  for (const r of board) {
    if (r.kind === "index") {
      const ix = ixById.get(r.id.toLowerCase());
      if (ix && !ix.isPublic) continue;
      const n = ix?.assets.length;
      out.push({
        key: r.id.toLowerCase(),
        type: "Index",
        n: r.name,
        sub: [r.symbol, n ? `${n} assets` : null, ix ? MODE[ix.mode] : null].filter(Boolean).join(" · "),
        px: r.level === undefined ? "—" : r.level.toFixed(2),
        href: `/index/${r.id}`,
        search: `${r.symbol} ${r.name} ${r.id}`.toLowerCase(),
        d1: r.change24h,
        d7: r.change7d ?? null,
        d30: r.change30d ?? null,
        volume: r.volume24hUsd ?? 0,
        icon: swatch(r.stocksPct),
        img: "",
        ini: "",
      });
      continue;
    }
    const a = aById.get(r.id);
    const vn = a?.display.chain === "hose";
    const type: MarketType = r.kind === "token" ? "Token" : vn ? "VN Stock" : "Stock";
    const sym = a?.displaySymbol ?? r.symbol;
    const logo = logoOf(r.id);
    out.push({
      key: r.id,
      type,
      n: sym,
      sub: vn ? `${r.name} · HOSE` : r.name,
      px: vn && vndPerUsd ? vndS(r.price?.usd, vndPerUsd) : priceS(r.price?.usd),
      href: `/asset/${r.id}`,
      search: `${sym} ${r.symbol} ${r.name} ${a?.execution.address ?? ""} ${a?.display.address ?? ""}`.toLowerCase(),
      d1: r.change24h,
      d7: r.change7d ?? null,
      d30: r.change30d ?? null,
      volume: r.volume24hUsd ?? 0,
      ...(vn && vndPerUsd ? { volS: vndVol(r.volume24hUsd ?? 0, vndPerUsd) } : {}),
      icon: "",
      img: logo ?? "",
      ini: logo ? "" : sym.slice(0, 2).toUpperCase(),
    });
  }
  return out.sort((x, y) => ORDER.indexOf(x.type) - ORDER.indexOf(y.type) || y.volume - x.volume);
}

const MATCH: Record<Filter, (x: MarketItem, watch: Set<string>) => boolean> = {
  All: () => true,
  Watchlist: (x, w) => w.has(x.key.toLowerCase()),
  Indexes: (x) => x.type === "Index",
  Stocks: (x) => x.type === "Stock",
  "VN Stocks": (x) => x.type === "VN Stock",
  Tokens: (x) => x.type === "Token",
};

export function filterItems(items: MarketItem[], f: Filter, watch: Set<string>, q: string): MarketItem[] {
  const s = q.trim().toLowerCase();
  return items.filter((x) => MATCH[f](x, watch) && (!s || x.search.includes(s)));
}

export function counts(items: MarketItem[], watch: Set<string>): Record<Filter, number> {
  return Object.fromEntries(FILTERS.map((f) => [f, items.filter((x) => MATCH[f](x, watch)).length])) as Record<Filter, number>;
}

/** Top mover of each type: the best 24h change (null changes never win). */
export function topMovers(items: MarketItem[]): MarketItem[] {
  const out: MarketItem[] = [];
  for (const t of ORDER) {
    const best = items.filter((x) => x.type === t && x.d1 !== null).sort((a, b) => (b.d1 ?? 0) - (a.d1 ?? 0))[0];
    if (best) out.push(best);
  }
  return out;
}

/** Polyline points for a 110×36 sparkline (x 1–109, y 3–33). */
export function sparkPoints(values: number[]): string {
  if (values.length < 2) return "";
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  return values.map((v, i) => `${((i / (values.length - 1)) * 108 + 1).toFixed(1)},${(33 - ((v - mn) / (mx - mn || 1)) * 30).toFixed(1)}`).join(" ");
}

export interface MarketInput {
  items: MarketItem[];
  filter: Filter;
  q: string;
  watch: Set<string>;
  sparks: Record<string, number[]>;
}

const KIND_LABEL: Record<MarketType, string> = { Index: "Top index", Stock: "Top stock", "VN Stock": "Top VN stock", Token: "Top token" };

export function marketVM(i: MarketInput) {
  const c = counts(i.items, i.watch);
  const chips = FILTERS.map((f) => {
    const on = f === i.filter;
    return { f, label: f === "Watchlist" ? "★ Watchlist" : f, n: c[f], on, bg: on ? "#F2F2F3" : "#17171A", fg: on ? "#0B0B0D" : "#B4B4BB", cnt: on ? "#46464D" : "#8E8E96" };
  });
  const rows = filterItems(i.items, i.filter, i.watch, i.q).map((x, k) => {
    const on = i.watch.has(x.key.toLowerCase());
    const dp = x.type === "Index" ? 2 : 1;
    const t = TYPE_STYLE[x.type];
    return {
      ...x,
      i: k + 1,
      d1s: pctS(x.d1, dp),
      d7s: pctS(x.d7, dp),
      d30s: pctS(x.d30, dp),
      c1: col(x.d1),
      c7: col(x.d7),
      c30: col(x.d30),
      volS: x.volS ?? vol(x.volume),
      tbg: t.tbg,
      tfg: t.tfg,
      aria: `Open ${x.n} chart`,
      on,
      sfill: on ? "#F5B14C" : "none",
      sline: on ? "#F5B14C" : "#8E8E96",
      starLabel: on ? `Remove ${x.n} from watchlist` : `Add ${x.n} to watchlist`,
    };
  });
  const movers = topMovers(i.items).map((x) => {
    const upMove = (x.d1 ?? 0) >= 0;
    return {
      key: x.key,
      n: x.n,
      kind: KIND_LABEL[x.type],
      px: x.px,
      d: pctS(x.d1, x.type === "Index" ? 2 : 1),
      dbg: upMove ? "#11261B" : "#2A1215",
      dfg: upMove ? "#3DD68C" : "#FF6B6B",
      icon: x.icon,
      img: x.img,
      ini: x.ini,
      href: x.href,
      pts: sparkPoints(i.sparks[x.key] ?? []),
    };
  });
  return { chips, rows, movers };
}
