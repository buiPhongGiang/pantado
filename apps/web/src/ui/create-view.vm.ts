import { roundPct } from "./num";
import { logoOf } from "../lib/logos";
import type { AssetView } from "../screens/asset.api";
import type { Backtest } from "../screens/create.metrics";
import type { Mode } from "../screens/create.draft";
import { AUTO_INTERVAL_DAYS, MODES, TICKER_RE, validate, type CreateState } from "../screens/create.vm";

/**
 * Create (reference/index-layer/Create): pure view model. An index is data on the IndexRegistry (B101): one
 * signature, network fee only, level starts at 100. Reuses `validate` and the rebalance modes of create.vm.
 */

export type KindTab = "All" | "Stocks" | "VN Stocks" | "Tokens";
export const KIND_TABS: KindTab[] = ["All", "Stocks", "VN Stocks", "Tokens"];

const isVn = (a: AssetView): boolean => a.kind === "stock" && a.display.chain === "hose";
export const kindLabel = (a: AssetView): string => (isVn(a) ? "VN Stock" : a.kind === "stock" ? "Stock" : "Token");

export function inTab(a: AssetView, t: KindTab): boolean {
  if (t === "All") return true;
  if (t === "VN Stocks") return isVn(a);
  if (t === "Stocks") return a.kind === "stock" && !isVn(a);
  return a.kind === "token";
}

export interface UniverseRow {
  id: string;
  t: string;
  name: string;
  img: string | null;
  ini: string;
  added: boolean;
  btn: string;
  aria: string;
  bg: string;
  fg: string;
}

export function universe(assets: AssetView[], tab: KindTab, search: string, picked: string[]): UniverseRow[] {
  const q = search.trim().toLowerCase();
  return assets
    .filter((a) => a.kind !== "quote" && inTab(a, tab))
    .filter((a) => !q || a.id.includes(q) || a.displaySymbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.execution.address ?? "").toLowerCase() === q)
    .map((a) => {
      const added = picked.includes(a.id);
      return {
        id: a.id,
        t: a.displaySymbol,
        name: a.name,
        img: logoOf(a.id),
        ini: a.displaySymbol.slice(0, 2),
        added,
        btn: added ? "Added" : "Add",
        aria: `${added ? "Remove" : "Add"} ${a.displaySymbol}`,
        bg: added ? "#1C1C20" : "#F2F2F3",
        fg: added ? "#B4B4BB" : "#0B0B0D",
      };
    });
}

export interface BasketRow {
  id: string;
  t: string;
  k: string;
  img: string | null;
  ini: string;
  c: string;
  w: number;
  wl: string;
}

export function basketRows(assets: AssetView[], s: Pick<CreateState, "picked" | "w">): BasketRow[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return s.picked.flatMap((id) => {
    const a = byId.get(id);
    if (!a) return [];
    const w = s.w[id] ?? 0;
    return [{ id, t: a.displaySymbol, k: kindLabel(a), img: logoOf(id), ini: a.displaySymbol.slice(0, 2), c: a.color, w, wl: `${w}%` }];
  });
}

/** "Stocks 40% · VN Stocks 20% · Tokens 40%" (VN only when present). */
export function splitText(rows: BasketRow[]): string {
  const sum = (k: string): number => rows.filter((r) => r.k === k).reduce((x, r) => x + r.w, 0);
  const st = sum("Stock");
  const vn = sum("VN Stock");
  const tk = sum("Token");
  if (!rows.length) return "Add assets to start";
  return [`Stocks ${st}%`, ...(vn ? [`VN Stocks ${vn}%`] : []), `Tokens ${tk}%`].join(" · ");
}

/** Drift band of an asset at a 20% target on a 0–60% track. */
export function driftBand(trig: number): { lo: string; hi: string; bandL: string; bandW: string; tgtL: string } {
  const lo = Math.max(0, 20 * (1 - trig / 100));
  const hi = Math.min(60, 20 * (1 + trig / 100));
  return {
    lo: (20 * (1 - trig / 100)).toFixed(0),
    hi: (20 * (1 + trig / 100)).toFixed(0),
    bandL: `${((lo / 60) * 100).toFixed(1)}%`,
    bandW: `${(((hi - lo) / 60) * 100).toFixed(1)}%`,
    tgtL: `${((20 / 60) * 100).toFixed(1)}%`,
  };
}

export const REB_NOTE: Record<Mode, string> = {
  Off: "Weights move with prices. The basket never changes.",
  Manual: "You publish new weights, at once or after a notice. The level carries over.",
  Auto: "Returns to its targets when an asset drifts too far. Anyone can apply it; nothing is traded.",
};

/** The four rule cells under Rebalancing (no notice, cap or loss budget: nothing is traded). */
export function rules(mode: Mode, trig: number): { k: string; v: string }[] {
  if (mode === "Auto")
    return [
      { k: "Trigger", v: `±${trig}%` },
      { k: "Or every", v: `${AUTO_INTERVAL_DAYS} days` },
      { k: "At most", v: "Once a day" },
      { k: "Applied by", v: "Anyone" },
    ];
  if (mode === "Manual")
    return [
      { k: "Notice", v: "Now or ≤ 30 days" },
      { k: "At most", v: "Once a day" },
      { k: "Applied by", v: "You" },
      { k: "Level", v: "Carries over" },
    ];
  return [];
}

export const VIS = [
  { label: "Public" as const, desc: "Listed in the Market for everyone to follow." },
  { label: "Private" as const, desc: "Only you see it, in Workspace. Make it public later." },
];

export interface CreateSummary {
  cta: { label: string; enabled: boolean };
  reviewTitle: string;
  reviewNote: string;
  rows: { k: string; v: string }[];
  ret: string;
  retC: string;
  vol: string;
  dd: string;
  vsAvax: string;
  vsC: string;
}

const pct = (f: number, dp: number, sign: boolean): string => {
  const r = roundPct(f, dp);
  return `${sign && r >= 0 ? "+" : ""}${r.toFixed(dp)}%`;
};

export function summary(
  s: CreateState,
  i: { tickerTaken: boolean | null; editing: { ticker: string } | null; bt: Backtest | null; avax: Backtest | null },
): CreateSummary {
  const invalid = validate(s, i.editing ? false : i.tickerTaken);
  const ticker = i.editing ? i.editing.ticker : s.ticker || "index";
  const isPublic = s.vis === "Public";
  const modeS = s.mode === "Auto" ? `Auto at ±${s.drift}% or every ${AUTO_INTERVAL_DAYS} days` : s.mode === "Manual" ? "You publish new weights" : "Off";
  const vs = i.bt && i.avax ? (i.bt.ret - i.avax.ret) * 100 : null;
  return {
    cta: { label: invalid ?? (i.editing ? "Review: update" : `Review: ${isPublic ? "publish" : "create"}`), enabled: !invalid },
    reviewTitle: i.editing ? `Review: update ${ticker}` : `Review: ${isPublic ? "publish" : "create"} ${ticker}`,
    reviewNote: i.editing
      ? "One signature publishes the new basket now. The level carries over and then follows the new assets and weights. Nothing is traded."
      : "One signature defines the index. Nothing is deposited, bought or held: the level starts at 100 and follows the published price of every asset in the basket.",
    rows: [
      { k: i.editing ? "Level" : "Starting level", v: i.editing ? "Carries over" : "100.00" },
      { k: "Rebalancing", v: modeS },
      { k: "Visibility", v: i.editing ? "Unchanged" : s.vis },
      { k: "Cost", v: "Network fee only" },
    ],
    ret: i.bt ? pct(i.bt.ret, 1, true) : "—",
    retC: i.bt ? (i.bt.ret >= 0 ? "#3DD68C" : "#FF6B6B") : "#8E8E96",
    vol: i.bt ? `${(i.bt.vol * 100).toFixed(0)}%` : "—",
    dd: i.bt ? pct(i.bt.dd, 1, false) : "—",
    vsAvax: vs === null ? "—" : `${vs >= 0 ? "+" : ""}${vs.toFixed(1)} pts`,
    vsC: vs === null ? "#8E8E96" : vs >= 0 ? "#3DD68C" : "#FF6B6B",
  };
}

export { MODES, TICKER_RE };
