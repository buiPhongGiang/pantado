import { DOWN, UP, withInitials } from "../lib/fmt";
import type { Scope } from "../lib/tpl";
import { logoAvatar, logoFill } from "../lib/logos";
import type { Me } from "../lib/chrome";
import type { AssetView } from "./asset.api";
import { errorNotice, staleNotice, txLine, wrongNetworkNotice, type Notice, type TxLine, type TxStateLike } from "./asset.states";
import type { Backtest } from "./create.metrics";
import type { Mode, PresetKey } from "./create.draft";

export type KindFilter = "All" | "Stocks" | "Tokens";
export type Vis = "Private" | "Public";
export type Step = "edit" | "review" | "done";

export const TICKER_RE = /^[A-Z0-9]{2,6}$/;
export const MAX_ASSETS = 20;

export interface CreateState {
  picked: string[];
  w: Record<string, number>;
  f: KindFilter;
  search: string;
  name: string;
  ticker: string;
  description: string;
  vis: Vis;
  mode: Mode;
  drift: number; // θ in percent (10–200)
  step: Step;
}

export interface CreateInput {
  s: CreateState;
  assets: AssetView[];
  tickerTaken: boolean | null;
  presetError: string | null;
  backtest: Backtest | null;
  tx: TxStateLike;
  created: { index: string | null } | null;
  /** editing an existing data index (Create with `?edit=`): a new basket for it, applied now */
  editing: { ticker: string; name: string } | null;
  wallet: { connected: boolean; chainOk: boolean };
  env: { network: string; explorer: string; nowSec: number; deployed: boolean };
  actions: {
    set: (p: Partial<CreateState>) => void;
    toggle: (id: string) => void;
    setW: (id: string, v: number) => void;
    preset: (p: PresetKey) => void;
    review: () => void;
    confirm: () => void;
    connect: () => void;
    switchChain: () => void;
  };
  me: Me;
}

const KIND: Record<KindFilter, AssetView["kind"] | null> = { All: null, Stocks: "stock", Tokens: "token" };
const GREY = "#8E8E96";

/** Rebalance choices of a data index (IndexRegistry): never, the creator publishes, or Auto (anyone pokes). */
export const MODES: Mode[] = ["Off", "Manual", "Auto"];
/** Auto interval offered by the app (contracts/config/params.json registry.intervalSec). */
export const AUTO_INTERVAL_DAYS = 30;

/** First failing rule as the reference CTA label, or null when the form is valid. */
export function validate(s: CreateState, tickerTaken: boolean | null): string | null {
  const total = s.picked.reduce((x, id) => x + (s.w[id] ?? 0), 0);
  if (total !== 100) return "Weights must total 100%";
  if (s.picked.length < 2) return "Add at least 2 assets";
  if (s.picked.some((id) => (s.w[id] ?? 0) < 1)) return "Every asset needs at least 1%";
  if (s.ticker.length < 2) return "Add a ticker";
  if (!TICKER_RE.test(s.ticker)) return "Ticker must be 2–6 characters, A–Z or 0–9.";
  if (tickerTaken) return "This ticker is already taken.";
  if (!s.name.trim()) return "Add a name";
  return null;
}

/** Create view model — same shape as reference/logic/create.js. */
export function createVM(i: CreateInput): Scope {
  const { s, actions } = i;
  const byId = new Map(i.assets.filter((a) => a.kind !== "quote").map((a) => [a.id, a]));
  const kindS = (a: AssetView): string => (a.kind === "stock" ? "Stock" : "Token");
  const q = s.search.trim().toLowerCase();
  const catalog = [...byId.values()]
    .filter((a) => !KIND[s.f] || a.kind === KIND[s.f])
    .filter((a) => !q || a.id.includes(q) || a.displaySymbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
    .map((a) => {
      const on = s.picked.includes(a.id);
      return {
        sym: a.displaySymbol,
        name: a.name,
        kind: kindS(a),
        dot: a.color,
        ...logoAvatar(a.id),
        on: on ? "true" : "false",
        btn: on ? "Added" : "Add",
        bg: on ? "#1F1F23" : "#F2F2F3",
        fg: on ? "#B4B4BB" : "#0B0B0D",
        toggle: () => actions.toggle(a.id),
      };
    });
  const sel = s.picked.map((id) => byId.get(id)).filter((a): a is AssetView => !!a);
  const basket = sel.map((a) => ({
    sym: a.displaySymbol,
    kind: kindS(a),
    dot: a.color,
    ...logoAvatar(a.id),
    w: s.w[a.id] ?? 0,
    label: `Weight of ${a.displaySymbol}`,
    rmLabel: `Remove ${a.displaySymbol}`,
    set: (e: { target: { value: string } }) => actions.setW(a.id, Number(e.target.value)),
    remove: () => actions.toggle(a.id),
  }));
  const total = basket.reduce((x, b) => x + b.w, 0);
  const t = total || 1;
  const stocks = sel.filter((a) => a.kind === "stock").reduce((x, a) => x + (s.w[a.id] ?? 0), 0);
  const invalid = validate(s, i.tickerTaken);
  const isPublic = s.vis === "Public";
  const ed = i.editing;
  const ticker = ed ? ed.ticker : s.ticker.toUpperCase();
  const bt = i.backtest;
  const pctS = (f: number, dp: number, sign: boolean): string => `${sign && f >= 0 ? "+" : ""}${(f * 100).toFixed(dp)}%`;

  const mode: Mode = s.mode;
  const wrongNet = i.wallet.connected && !i.wallet.chainOk;
  const notices: Notice[] = [];
  if (wrongNet) notices.push(wrongNetworkNotice(i.env.network));
  if (!i.env.deployed) notices.push(errorNotice("Creating is not available: Pantado is not deployed on this network yet."));
  if (i.presetError) notices.push({ tone: "amber", title: i.presetError, body: "Your weights were kept." });
  if (i.tickerTaken && s.step === "edit") notices.push(errorNotice("This ticker is already taken."));
  // the starting units are set from fresh prices: a stale price blocks the create
  const staleA = sel.find((a) => a.price?.fresh === false);
  if (s.step === "review" && staleA) notices.push(staleNotice(staleA.displaySymbol, "this basket", staleA.price?.ts ?? null, i.env.nowSec, false));
  const status: TxLine | null =
    s.step === "done"
      ? null
      : txLine(
          i.tx,
          ed
            ? { pendingSub: `One signature publishes the new basket of ${ticker}.`, confirmed: `Updated ${ticker}`, failed: "Update failed" }
            : { pendingSub: `One signature defines ${ticker}. Nothing is deposited.`, confirmed: `Created ${ticker}`, failed: "Create failed" },
          i.env.network,
          i.env.explorer,
        );
  const confirm = (): void => {
    if (wrongNet) return actions.switchChain();
    if (!i.wallet.connected) return actions.connect();
    if (i.tx.status === "pending" || notices.length > 0) return;
    actions.confirm();
  };

  return withInitials({
    chips: (["All", "Stocks", "Tokens"] as KindFilter[]).map((c) => ({
      label: c,
      on: c === s.f ? "true" : "false",
      bg: c === s.f ? "#F2F2F3" : "#1A1A1D",
      fg: c === s.f ? "#0B0B0D" : "#B4B4BB",
      pick: () => actions.set({ f: c }),
    })),
    catalog,
    basket,
    presets: [
      { label: "Equal", pick: () => actions.preset("equal") },
      { label: "Market cap", pick: () => actions.preset("marketcap") },
      { label: "Low volatility", pick: () => actions.preset("lowvol") },
    ],
    vis: (["Private", "Public"] as Vis[]).map((x) => ({
      label: x,
      on: x === s.vis ? "true" : "false",
      bg: x === s.vis ? "#2A2A2F" : "transparent",
      fg: x === s.vis ? "#F2F2F3" : GREY,
      pick: () => actions.set({ vis: x }),
    })),
    isPublic,
    segs: basket.map((b) => ({ w: b.w, dot: b.dot })),
    total,
    totalCol: total === 100 ? UP : "#F5B14C",
    mixText: total ? `Stocks ${Math.round((stocks / t) * 100)}% · Tokens ${100 - Math.round((stocks / t) * 100)}%` : "Add assets to start",
    ret: bt ? pctS(bt.ret, 1, true) : "—",
    retCol: bt ? (bt.ret >= 0 ? UP : DOWN) : GREY,
    vol: bt ? `${(bt.vol * 100).toFixed(0)}%` : "—",
    dd: bt ? pctS(bt.dd, 1, false) : "—",
    disabled: invalid ? "true" : "false",
    created: s.step === "done" || notices.length > 0 || status !== null,
    isDone: s.step === "done",
    reviewing: s.step === "review",
    createdText: ed ? `Updated ${ticker}. The level carried over.` : `${isPublic ? "Published " : "Created "}${ticker} at level 100.`,
    createdSub: isPublic
      ? "It is listed in the Marketplace for everyone to follow."
      : "Private: it is not listed in the Marketplace. Only you see it, in Portfolio › Your indexes. You can make it public later.",
    _href: i.created?.index ? { IndexDetail: `/index/${i.created.index}` } : {},
    // no trading (owner): nobody else buys or sells the index, so there is no creator fee to promise
    earnNote: "Listed in the Marketplace for everyone to follow",
    visLabel: isPublic ? "Public" : "Private",
    modeSummary: mode === "Auto" ? `Auto at ±${s.drift}% drift or every ${AUTO_INTERVAL_DAYS} days` : mode === "Manual" ? "You publish new weights" : "Off",
    // indexes are data (B101): nothing is deposited, bought or held
    feeLine: "No deposit · network fee only",
    reviewTitle: ed ? `Review: update ${ticker}` : `Review: ${isPublic ? "publish" : "create"} ${ticker || "index"}`,
    receiveLabel: ed ? "Level" : "Starting level",
    unitsS: ed ? "Carries over" : "100.00",
    reviewNote: ed
      ? "One signature publishes the new basket now. The level carries over and then follows the new assets and weights. Nothing is traded."
      : "One signature defines the index. Nothing is deposited, bought or held: the level starts at 100 and follows the published price of every asset in the basket.",
    name: s.name,
    ticker: s.ticker,
    onTicker: (e: { target: { value: string } }) => actions.set({ ticker: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) }),
    back: () => actions.set({ step: "edit" }),
    confirm,
    create: () => {
      if (!invalid) actions.review();
    },
    cta: !invalid
      ? { bg: "#F2F2F3", fg: "#0B0B0D", label: ed ? "Review: update" : `Review: ${isPublic ? "publish" : "create"}` }
      : { bg: "#1F1F23", fg: GREY, label: invalid },
    modes: MODES.map((m) => ({
      label: m,
      on: m === mode ? "true" : "false",
      bg: m === mode ? "#2A2A2F" : "transparent",
      fg: m === mode ? "#F2F2F3" : GREY,
      pick: () => actions.set({ mode: m }),
    })),
    modeText:
      mode === "Off"
        ? "Weights move with prices. The basket never changes."
        : mode === "Manual"
          ? "You publish new weights, at most once a day, at once or after a notice. The level carries over."
          : "Returns to its targets when an asset drifts too far. Anyone can apply it; nothing is traded.",
    isAuto: mode === "Auto",
    drift: s.drift,
    onDrift: (e: { target: { value: string } }) => actions.set({ drift: Number(e.target.value) }),
    driftEx: `A 20% target triggers below ${(20 * (1 - s.drift / 100)).toFixed(0)}% or above ${(20 * (1 + s.drift / 100)).toFixed(0)}%.`,
    notices,
    status,
    me: i.me,
  });
}
