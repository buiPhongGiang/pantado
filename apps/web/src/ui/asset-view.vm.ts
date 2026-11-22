import { pctS, roundPct } from "./num";
import { ago, money, vol } from "../lib/fmt";
import { logoOf } from "../lib/logos";
import { short } from "../lib/nav";
import type { AssetDetail, BoardRowView, CandlesView, IndexView, PoolView } from "../screens/asset.api";
import { changeOver, priceS } from "../screens/asset.vm";
import type { NetworkView } from "../screens/network.vm";

/**
 * Asset chart page (reference/index-layer Token, Stock, StockVN): one view model, three variants. Every figure comes
 * from the API; design stats without a source (liquidity, cross-check, block, FX, ceiling / floor) are not shown.
 * Nothing here trades: the page is the asset's chart, where its price comes from, and how to read it.
 */

export type Variant = "token" | "stock" | "vn";
export type DataTab = "API" | "Candles" | "On-chain";
export type ListTab = "Sources" | "Updates";

const UPC = "#3DD68C";
const DOWNC = "#FF6B6B";
const GREY = "#8E8E96";

export function variantOf(a: Pick<AssetDetail, "kind" | "display"> | null): Variant {
  if (!a || a.kind !== "stock") return "token";
  return a.display.chain === "hose" ? "vn" : "stock";
}

const TYPE: Record<Variant, { label: string; bg: string; fg: string; dot: string }> = {
  token: { label: "Token", bg: "#1C1C20", fg: "#B4B4BB", dot: "#E84142" },
  stock: { label: "Stock", bg: "#1C1C20", fg: "#B4B4BB", dot: "#4C8DFF" },
  vn: { label: "VN Stock", bg: "#10262A", fg: "#2FC7C0", dot: "#2FC7C0" },
};

const pct = (v: number | null | undefined, dp = 1): string => pctS(v, dp);
const col = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? GREY : roundPct(v, 2) >= 0 ? UPC : DOWNC);
/** "$3.7992" / "$169.9512": the canonical price with four decimals (more below one cent). */
export function exactUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v >= 1000) return money(v, 2);
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return priceS(v);
}

/** HOSE trading session (ICT = UTC+7): 09:00–11:30 and 13:00–15:00 on weekdays (config/vn-market.json). */
export function hoseSession(nowSec: number): { open: boolean; label: string } {
  const d = new Date((nowSec + 7 * 3600) * 1000);
  const day = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} ICT`;
  const open = day >= 1 && day <= 5 && ((m >= 540 && m < 690) || (m >= 780 && m < 900));
  return { open, label: open ? `HOSE open · ${hhmm}` : `HOSE closed · ${hhmm}` };
}

/** "96,500 ₫" */
export const vnd = (v: number): string => `${Math.round(v).toLocaleString("en-US")} ₫`;
/** "412.6B ₫" / "85.3M ₫" */
export function vndBig(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B ₫`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M ₫`;
  return vnd(v);
}

export interface AssetViewInput {
  asset: AssetDetail | null;
  board: BoardRowView | null;
  daily: CandlesView | null;
  pools: PoolView[];
  indexes: IndexView[];
  network: NetworkView | null;
  nowSec: number;
  watched: boolean;
  dtab: DataTab;
  tab: ListTab;
  apiUrl: string;
  /** `/fx`: VND per USD (the rate market-data converts HOSE prices with); null → VN prices stay in USD */
  vndPerUsd: number | null;
}

export interface Pill {
  label: string;
  bg: string;
  fg: string;
}

export interface AssetViewVM {
  variant: Variant;
  loaded: boolean;
  sym: string;
  name: string;
  logo: string | null;
  color: string;
  type: { label: string; bg: string; fg: string };
  source: { label: string; dot: string };
  session: Pill | null;
  pair: string;
  price: string;
  /** VN in ₫: the USD price under it */
  priceSub: string | null;
  d24: string;
  d24c: string;
  /** VN in ₫: the 24h move in ₫ */
  d24Sub: string | null;
  /** VN in ₫: candles are shown ×vndPerUsd */
  fx: number | null;
  tiles: { k: string; v: string }[];
  perf: { k: string; v: string; c: string }[];
  priceCard: { title: string; value: string; pill: Pill; rows: { k: string; v: string; mono: boolean }[]; networkLink: boolean };
  tabs: ListTab[];
  cols: { t: string; al: "left" | "right" }[];
  rows: { a: string; a2: string; b: string; c: string; d: string; e: string; ec: string }[];
  emptyRows: string;
  inIdx: { n: string; w: string; href: string }[];
  data: { tabs: DataTab[]; kind: string; code: string; note: string; cta: string; copy: string; v1l: string; v1: string; v2l: string; v2: string };
  star: { on: boolean; label: string };
}

/** Indexes whose basket holds the asset (execution address), with its target weight, largest first. */
export function holdingIndexes(a: AssetDetail | null, indexes: IndexView[]): { n: string; w: string; href: string }[] {
  const addr = a?.execution.address?.toLowerCase();
  if (!addr) return [];
  return indexes
    .flatMap((ix) => {
      const i = ix.assets.findIndex((x) => x.toLowerCase() === addr);
      return i < 0 ? [] : [{ n: ix.name, bps: ix.targetBps[i] ?? 0, href: `/index/${ix.id}` }];
    })
    .sort((x, y) => y.bps - x.bps)
    .map((x) => ({ n: x.n, w: `${(x.bps / 100).toFixed(0)}%`, href: x.href }));
}

export function assetViewVM(i: AssetViewInput): AssetViewVM {
  const a = i.asset;
  const v = variantOf(a);
  const t = TYPE[v];
  const sym = a?.displaySymbol ?? "—";
  const px = a?.price?.usd ?? null;
  const fresh = a?.price?.fresh ?? false;
  const age = a?.price ? ago(a.price.ts, i.nowSec) : "—";
  const b = i.board;
  const d90 = changeOver(i.daily, 90, i.nowSec);
  const inIdx = holdingIndexes(a, i.indexes);
  const np = i.network?.prices.find((p) => p.id === a?.id) ?? null;

  // header
  const sourceLabel = v === "token" ? "Avalanche C-Chain (on-chain)" : (a?.badge ?? a?.dataSource ?? "");
  let session: Pill | null = null;
  if (v === "vn") {
    const s = hoseSession(i.nowSec);
    session = { label: s.label, bg: s.open ? "#11261B" : "#1F1F23", fg: s.open ? UPC : "#B4B4BB" };
  }

  // VN stocks in ₫ when the rate is known (`/fx`), else USD
  const fx = v === "vn" && i.vndPerUsd && i.vndPerUsd > 0 ? i.vndPerUsd : null;
  const volS = b?.volume24hUsd === null || b?.volume24hUsd === undefined ? "—" : fx ? vndBig(b.volume24hUsd * fx) : vol(b.volume24hUsd);
  const c24 = b?.change24h ?? null;
  const d24Sub = fx && px !== null && c24 !== null && c24 > -1 ? `${c24 >= 0 ? "+" : "-"}${vnd(Math.abs(px * fx - (px * fx) / (1 + c24)))}` : null;
  // tiles: what the API has; the design's liquidity tile has no source
  const tiles = [
    { k: "VOLUME 24H", v: volS },
    ...(v === "vn" ? [{ k: "PRICE BAND", v: "±7%" }] : []),
    { k: "IN INDEXES", v: String(inIdx.length) },
  ];
  const perf = [
    { k: "24H", v: b?.change24h ?? null },
    { k: "7D", v: b?.change7d ?? null },
    { k: "30D", v: b?.change30d ?? null },
    { k: "90D", v: d90 },
  ].map((x) => ({ k: x.k, v: pct(x.v), c: col(x.v) }));

  // price card
  let priceCard: AssetViewVM["priceCard"];
  if (v === "vn") {
    const net = i.network;
    const active = net ? net.reporters.filter((r) => r.active).length : null;
    const delivered = net ? net.rounds.filter((r) => r.icmDelaySec !== null) : [];
    const avg = delivered.length ? delivered.reduce((s, r) => s + (r.icmDelaySec ?? 0), 0) / delivered.length : null;
    const sync = np && np.l1Round !== null && np.cchainRound !== null && np.cchainRound >= np.l1Round;
    priceCard = {
      title: np?.l1Round ? `Median, round #${np.l1Round.toLocaleString("en-US")}` : "Median",
      value: exactUsd(np?.l1Usd ?? px),
      pill: !np ? { label: "No round yet", bg: "#1F1F23", fg: "#B4B4BB" } : sync ? { label: "In sync", bg: "#11261B", fg: UPC } : { label: "Behind", bg: "#2E2311", fg: "#F5B14C" },
      rows: [
        { k: "Source", v: "HOSE matched trades", mono: false },
        { k: "Reported by", v: net && active !== null ? `${net.threshold} of ${active} reporters, median` : "—", mono: false },
        { k: "To C-Chain", v: avg === null ? "Avalanche ICM" : `Avalanche ICM · ${avg.toFixed(0)}s after final`, mono: false },
        ...(fx ? [{ k: "FX", v: `USD / VND ${Math.round(fx).toLocaleString("en-US")}`, mono: false }] : []),
        { k: "Age", v: age, mono: false },
      ],
      networkLink: true,
    };
  } else {
    const contract = a?.display.address ?? a?.execution.address ?? null;
    priceCard = {
      title: "Canonical price",
      value: exactUsd(px),
      pill: a?.price ? { label: `${fresh ? "Fresh" : "Stale"} · ${age}`, bg: fresh ? "#11261B" : "#2E2311", fg: fresh ? UPC : "#F5B14C" } : { label: "No price", bg: "#1F1F23", fg: "#B4B4BB" },
      rows: [
        { k: "Source", v: v === "token" ? "C-Chain pools, liquidity-weighted" : `Reference pool · ${sym} / USDC`, mono: false },
        ...(contract ? [{ k: "Contract", v: short(contract), mono: true }] : []),
      ],
      networkLink: false,
    };
  }

  // sources / updates
  let tabs: ListTab[] = ["Sources"];
  let cols: AssetViewVM["cols"] = [];
  let rows: AssetViewVM["rows"] = [];
  let emptyRows = "";
  if (v === "vn") {
    tabs = ["Sources", "Updates"];
    const net = i.network;
    if (i.tab === "Updates") {
      cols = ["TIME (UTC)", "ROUND", "MEDIAN", "REPORTERS", "STATUS"].map((x, k) => ({ t: x, al: k === 0 ? "left" : "right" }));
      rows = (net?.rounds ?? []).slice(0, 8).map((r) => {
        const st = r.deliveredAt !== null ? "Delivered" : r.finalizedAt !== null ? "Final on L1" : "Collecting";
        return {
          a: new Date(r.round * (net?.roundSec ?? 60) * 1000).toISOString().slice(11, 16),
          a2: "Pantado Price Chain",
          b: `#${r.round.toLocaleString("en-US")}`,
          c: np && np.l1Round === r.round ? exactUsd(np.l1Usd) : "—",
          d: `${r.reporters.length} of ${net?.reporters.filter((x) => x.active).length ?? "—"}`,
          e: st,
          ec: st === "Delivered" ? UPC : st === "Final on L1" ? "#F5B14C" : "#B4B4BB",
        };
      });
      emptyRows = net ? "No rounds yet." : "The price chain is not configured on this server.";
    } else {
      cols = ["SOURCE", "PAIR", "PRICE", "UPDATED", "ROLE"].map((x, k) => ({ t: x, al: k === 0 ? "left" : "right" }));
      rows = (net?.reporters ?? [])
        .filter((r) => r.active)
        .map((r) => ({
          a: short(r.address),
          a2: "Price Chain reporter",
          b: `${sym} / USD`,
          c: r.maxDeviationBps === null ? "—" : `${(r.maxDeviationBps / 100).toFixed(2)}% from median`,
          d: r.lastAt === null ? "—" : ago(r.lastAt, i.nowSec),
          e: "Reporter",
          ec: "#B4B4BB",
        }));
      emptyRows = net ? "No reporter has reported yet." : "The price chain is not configured on this server.";
    }
  } else {
    cols = ["SOURCE", "CHAIN", "POOL", "DEX", "ROLE"].map((x, k) => ({ t: x, al: k === 0 ? "left" : "right" }));
    let first = true;
    rows = i.pools
      .filter((p) => p.kind === "reference")
      .map((p) => {
        const role = first ? "Price source" : "Cross-check";
        first = false;
        return {
          a: "Reference pool",
          a2: p.chain === "robinhood" ? "On-chain" : "Avalanche C-Chain",
          b: p.chain === "robinhood" ? "On-chain" : "Avalanche",
          c: short(p.address),
          d: p.dex ?? "—",
          e: role,
          ec: "#B4B4BB",
        };
      });
    emptyRows = "No confirmed reference pool yet; the price is the canonical feed.";
  }

  // use this data
  const idPath = `/assets/${a?.id ?? ""}`;
  const DT: Record<DataTab, { kind: string; code: string; note: string; cta: string; copy: string }> = {
    API: { kind: "REST · GET", code: idPath, note: v === "vn" ? "Canonical price in USD, its round and age. Stale prices are flagged." : "Canonical price, its source and age. Stale prices are flagged.", cta: "Copy request", copy: `${i.apiUrl}${idPath}` },
    Candles: {
      kind: "REST · GET",
      code: `${idPath}/candles?interval=1d&limit=90`,
      note: v === "vn" ? "OHLC history from HOSE matched trades." : "OHLC history from the reference market.",
      cta: "Copy request",
      copy: `${i.apiUrl}${idPath}/candles?interval=1d&limit=90`,
    },
    "On-chain":
      v === "vn"
        ? {
            kind: "SOLIDITY · C-CHAIN",
            code: `PriceChainReceiver.priceOf("${a?.id ?? ""}")${np?.cchainUsd ? `\n// ${np.cchainUsd.toFixed(4)}e18 · round ${np.cchainRound?.toLocaleString("en-US") ?? "—"}` : ""}`,
            note: "The median delivered from the Pantado Price Chain over ICM.",
            cta: "Copy call",
            copy: `PriceChainReceiver(${i.network?.chain.receiver ?? ""}).priceOf(bytes32("${a?.id ?? ""}"))`,
          }
        : {
            kind: "SOLIDITY · EXECUTION CHAIN",
            code: `PriceOracle.getPrice(${sym})${px ? `\n// ${px.toFixed(4)}e18` : ""}`,
            note: "The price Pantado indexes read.",
            cta: "Copy call",
            copy: `PriceOracle.getPrice(${a?.execution.address ?? ""})`,
          },
  };
  const dc = DT[i.dtab];

  return {
    variant: v,
    loaded: a !== null,
    sym,
    name: a?.name ?? "",
    logo: logoOf(a?.id),
    color: a?.color ?? GREY,
    type: { label: t.label, bg: t.bg, fg: t.fg },
    source: { label: sourceLabel, dot: t.dot },
    session,
    pair: v === "vn" ? `${sym} · HOSE` : `${sym} / USDC`,
    price: fx && px !== null ? vnd(px * fx) : priceS(px),
    priceSub: fx && px !== null ? `≈ ${priceS(px)}` : null,
    d24: pct(b?.change24h ?? null),
    d24c: col(b?.change24h ?? null),
    d24Sub,
    fx,
    tiles,
    perf,
    priceCard,
    tabs,
    cols,
    rows,
    emptyRows,
    inIdx,
    data: { tabs: ["API", "Candles", "On-chain"], ...dc, v1l: "Price", v1: exactUsd(px), v2l: "Age", v2: age },
    star: { on: i.watched, label: i.watched ? "In watchlist" : "Add to watchlist" },
  };
}
