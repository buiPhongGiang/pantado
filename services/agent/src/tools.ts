import { z } from "zod";
import type { Asset } from "@pantado/shared";
import { backtest, periodStart, summarize, type Candle } from "./analytics.js";
import type { PantadoApi } from "./api-client.js";
import { draftLink, resolveAssetId, validateDraft, type DraftLimits } from "./draft.js";
import type { ToolSpec } from "./llm.js";

/** Card shown in the Ask conversation (PORTING.md agent contract). */
export interface Card {
  kind: "asset" | "draft" | "index" | "compare";
  data: unknown;
}

export interface ToolOutput {
  result: unknown;
  card?: Card;
}

export interface ToolCtx {
  api: PantadoApi;
  assets: Asset[];
  limits: DraftLimits;
  /** Connected wallet of this conversation (from its session), null when anonymous. Read-only use. */
  wallet?: string | null;
  /** Start of the price history (unix seconds, `marketData.history.since`). */
  historySince?: number;
  /** Asset id the backtest compares against (`agent.benchmark`). */
  benchmark?: string;
  now?: () => number;
}

const PERIODS = ["7d", "30d", "90d", "180d", "1y", "ytd", "all"] as const;
const nowOf = (ctx: ToolCtx): number => (ctx.now ?? (() => Math.floor(Date.now() / 1000)))();
const idOf = (key: string, ctx: ToolCtx): string => resolveAssetId(key, ctx.assets) ?? key.trim().toLowerCase().replace(/\./g, "");
const fail = (e: unknown): { error: string } => ({ error: e instanceof Error ? e.message : String(e) });

async function daily(ctx: ToolCtx, id: string, from: number): Promise<{ source: string | null; candles: Candle[] }> {
  const days = Math.min(5000, Math.ceil((nowOf(ctx) - from) / 86_400) + 2);
  return ctx.api.get<{ source: string | null; candles: Candle[] }>(`/assets/${encodeURIComponent(id)}/candles?interval=1d&limit=${days}`);
}

interface ToolDef<S extends z.ZodType> {
  spec: ToolSpec;
  schema: S;
  run(input: z.output<S>, ctx: ToolCtx): Promise<ToolOutput>;
}

const def = <S extends z.ZodType>(name: string, description: string, schema: S, run: ToolDef<S>["run"]): ToolDef<S> => ({
  spec: { name, description, inputSchema: { ...(z.toJSONSchema(schema) as Record<string, unknown>), additionalProperties: false } },
  schema,
  run,
});

/** Plain-language explanations; numbers come from contract parameters (spec §5, §13). */
const GLOSSARY: Record<string, string> = {
  level:
    "An index is data, not a fund: its level is Σ units × price of its assets, from the prices published on Avalanche. At creation the weights become fixed units so every index starts at 100.00; then the level follows the prices.",
  drift: "Drift is how far an asset's current weight is from its target, relative to the target: |current − target| / target. An Auto index returns to its targets when the largest drift reaches its threshold (10–200 %, default 50 %) or every 30 days.",
  rebalancing:
    "Rebalancing changes the units, not holdings: nothing is traded. The new units are derived at the current level, so the level never jumps. Manual: the creator publishes a new basket (assets and weights) at once or after a notice of up to 30 days, at most once a day. Auto: anyone can apply it when the interval has passed or the drift trigger is reached. An asset that is delisted or has no price for 7 days is dropped at its last price and its weight goes pro rata to the others.",
  costs: "Creating an index costs only the network fee: nothing is deposited, bought or held, and there are no trading or management fees. Anyone with a wallet can create one; each wallet can have up to 20 public indexes.",
  modes: "Off: the basket never changes and weights move with prices. Manual: the creator publishes new baskets with a reason. Auto: fixed targets, restored on drift or on a fixed interval.",
  stocks:
    "US stock prices come from the on-chain reference market. Vietnamese stocks come from HOSE matched trades (off-chain): independent reporters submit them to the Pantado Price Chain, an Avalanche L1 that keeps the median of each round and delivers it to the C-Chain over ICM.",
};

export function buildTools(): ToolDef<z.ZodType>[] {
  const tools = [
    def(
      "search_assets",
      "Find listed assets by ticker, name or contract address. Call it first when the user names an asset you are not sure is listed, or when a ticker could match several assets; then use the returned id with the other tools. Not needed for well-known listed tickers (AVAX, BTC.b, NVDA).",
      z.object({ query: z.string().min(1).describe("ticker, name or 0x contract address") }),
      async ({ query }, ctx) => ({ result: await ctx.api.get<unknown>(`/assets/search?q=${encodeURIComponent(query)}`) }),
    ),
    def(
      "get_asset",
      "Current price (with its timestamp and source), 24h/7d/30d change, trading venue state and limits of ONE listed asset. Shows the asset card. For changes over other periods, highs/lows or volatility use price_history; for 2–4 assets use compare_assets.",
      z.object({ asset: z.string().describe("ticker, name or id, e.g. NVDA, BTC.b, avax") }),
      async ({ asset }, ctx) => {
        const a = await ctx.api.get<Record<string, unknown>>(`/assets/${encodeURIComponent(idOf(asset, ctx))}`);
        const board = await ctx.api.get<{ id: string }[]>("/board");
        const row = board.find((r) => r.id === a.id) ?? null;
        const data = { ...a, board: row };
        return { result: data, card: { kind: "asset", data } };
      },
    ),
    def(
      "compare_assets",
      "Compare 2–4 listed assets side by side: price, 24h/7d/30d change, kind. For longer periods add price_history per asset.",
      z.object({ assets: z.array(z.string()).min(2).max(4) }),
      async ({ assets }, ctx) => {
        const board = await ctx.api.get<{ id: string; symbol: string }[]>("/board");
        const rows = assets.map((k) => {
          const id = idOf(k, ctx);
          return board.find((r) => r.id === id) ?? { id, missing: true };
        });
        return { result: rows, card: { kind: "compare", data: rows } };
      },
    ),
    def(
      "price_history",
      "Price history summary of ONE asset over a period, from daily candles of its reference market: open, close, return %, highest and lowest price with dates, annualised volatility %, max drawdown %. Use for 'how did X do in March / this year / since …' and for risk questions. History starts 2025-01-01 (stocks: when their reference market opened); coverage 'partial' means the data starts later than asked — say so.",
      z.object({
        asset: z.string(),
        period: z.enum(PERIODS).optional().describe("named period ending today; ignored when from is given"),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("start date YYYY-MM-DD"),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("end date YYYY-MM-DD, default today"),
      }),
      async ({ asset, period, from, to }, ctx) => {
        const id = idOf(asset, ctx);
        const now = nowOf(ctx);
        const since = ctx.historySince ?? 0;
        const f = from ? Date.parse(`${from}T00:00:00Z`) / 1000 : periodStart(period ?? "30d", now, since);
        const t = to ? Date.parse(`${to}T00:00:00Z`) / 1000 + 86_399 : now;
        if (!(f < t)) return { result: { error: "from must be before to" } };
        try {
          const h = await daily(ctx, id, Math.max(f, since));
          const sum = summarize(h.candles, Math.max(f, since), t);
          if (!sum) return { result: { asset: id, coverage: "none", error: "no price history for this period" } };
          return { result: { asset: id, source: h.source, ...sum, ...(f < since ? { coverage: "partial" as const } : {}) } };
        } catch (e) {
          return { result: fail(e) };
        }
      },
    ),
    def(
      "get_board",
      "Market board: listed stocks, tokens and public indexes with price and 24h/7d/30d changes (top 40). Use for 'what moved most', 'best tokens this week' or to pick candidates for a theme.",
      z.object({ kind: z.enum(["all", "stocks", "tokens", "indexes"]).default("all") }),
      async ({ kind }, ctx) => {
        const rows = await ctx.api.get<unknown[]>(`/board?kind=${kind}`);
        return { result: rows.slice(0, 40) };
      },
    ),
    def(
      "get_index",
      "One public index by ticker or address: composition with current vs target weights, level (starts at 100), mode, version, rebalances. Shows the index card (with its Buy / View links). Use before answering anything about an existing index.",
      z.object({ index: z.string().describe("ticker (e.g. CSTK) or 0x address") }),
      async ({ index }, ctx) => {
        let addr = index;
        if (!/^0x[0-9a-fA-F]{40}$/.test(index)) {
          const list = await ctx.api.get<{ id: string; ticker: string }[]>("/indexes");
          const hit = list.find((i) => i.ticker.toLowerCase() === index.toLowerCase().replace(/^idx-/, ""));
          if (!hit) return { result: { error: `No public index with ticker ${index}` } };
          addr = hit.id;
        }
        const [detail, comp] = await Promise.all([ctx.api.get<unknown>(`/indexes/${addr}`), ctx.api.get<unknown>(`/indexes/${addr}/composition`)]);
        const data = { detail, composition: comp };
        return { result: data, card: { kind: "index", data } };
      },
    ),
    def(
      "get_presets",
      "Deterministic weights for 2–20 assets: equal, marketcap (∝ market cap, 40 % cap per asset, excess redistributed) or lowvol (∝ 1 / 90-day volatility). Never invent weights for these presets — call this, or pass the preset to draft_index.",
      z.object({ assets: z.array(z.string()).min(2).max(20), preset: z.enum(["equal", "marketcap", "lowvol"]) }),
      async ({ assets, preset }, ctx) => {
        try {
          return { result: await ctx.api.get<unknown>(`/presets?assets=${assets.map((a) => idOf(a, ctx)).join(",")}&preset=${preset}`) };
        } catch (e) {
          return { result: fail(e) };
        }
      },
    ),
    def(
      "run_backtest",
      "Hypothetical past performance of a basket (2–20 listed assets, whole-percent weights summing to 100) over a period: return %, annualised volatility %, max drawdown %, against a benchmark, held or reset monthly. Call it before recommending an index; report it as hypothetical (no fees, not a forecast). Coverage 'partial' means the common history starts later than asked — say from when.",
      z.object({
        assets: z.array(z.string()).min(2).max(20),
        weights: z.array(z.number().int().min(1).max(100)).describe("whole percents in the order of assets, sum 100"),
        period: z.enum(PERIODS).default("1y"),
        rebalance: z.enum(["none", "monthly"]).default("monthly").describe("monthly ≈ Auto mode's 30-day reset"),
      }),
      async ({ assets, weights, period, rebalance }, ctx) => {
        if (weights.length !== assets.length) return { result: { error: "one weight per asset" } };
        if (weights.reduce((a, b) => a + b, 0) !== 100) return { result: { error: "weights must sum to 100" } };
        const ids = assets.map((a) => idOf(a, ctx));
        if (new Set(ids).size !== ids.length) return { result: { error: "each asset once" } };
        const now = nowOf(ctx);
        const since = ctx.historySince ?? 0;
        const from = Math.max(periodStart(period, now, since), since);
        try {
          const bid = ctx.benchmark ?? null;
          const [hist, bench] = await Promise.all([Promise.all(ids.map((id) => daily(ctx, id, from))), bid ? daily(ctx, bid, from) : Promise.resolve(null)]);
          const series = new Map(ids.map((id, i) => [id, hist[i]?.candles ?? []]));
          const w = new Map(ids.map((id, i) => [id, (weights[i] as number) / 100]));
          const r = backtest(series, w, from, now, rebalance, bid && bench ? { id: bid, candles: bench.candles } : null);
          return { result: { assets: ids, weights, ...r } };
        } catch (e) {
          return { result: fail(e) };
        }
      },
    ),
    def(
      "draft_index",
      "Create a draft index the user reviews and signs in Create (shows the draft card with 'Create from this'). Listed assets only, within the protocol limits; weights are whole percents summing to 100, each ≥ 1. With a preset, pass preset and omit weights. The user signs; you never send transactions.",
      z.object({
        name: z.string(),
        ticker: z.string(),
        description: z.string().default(""),
        components: z.array(z.string()),
        weights: z.array(z.number().int()).optional(),
        preset: z.enum(["equal", "marketcap", "lowvol", "custom"]).default("custom"),
        mode: z.enum(["Off", "Manual", "Auto"]).default("Auto"),
        driftPct: z.number().optional(),
        rationale: z.string(),
      }),
      async (input, ctx) => {
        let weights = input.weights;
        if (!weights && input.preset !== "custom") {
          try {
            const p = await ctx.api.get<{ weights: number[] }>(`/presets?assets=${input.components.map((a) => idOf(a, ctx)).join(",")}&preset=${input.preset}`);
            weights = p.weights;
          } catch (e) {
            return { result: { error: `preset unavailable: ${fail(e).error}` } };
          }
        }
        const r = validateDraft({ ...input, weights }, ctx.assets, ctx.limits);
        if (!r.ok) return { result: { error: "draft invalid", details: r.errors } };
        const data = { ...r.draft, link: draftLink(r.draft) };
        return { result: data, card: { kind: "draft", data } };
      },
    ),
    def(
      "get_portfolio",
      "The indexes the connected wallet created (and any legacy positions), on Fuji testnet. Only for questions about the user's own indexes. Returns an error when no wallet is connected — then ask the user to connect.",
      z.object({}),
      async (_i, ctx) => {
        if (!ctx.wallet) return { result: { error: "No wallet connected. Connect a wallet to see your portfolio." } };
        try {
          return { result: await ctx.api.get<unknown>(`/portfolio/${ctx.wallet}`) };
        } catch (e) {
          return { result: fail(e) };
        }
      },
    ),
    def(
      "explain",
      "Explain a Pantado concept with the protocol's real parameters (limits, timings, costs). Use instead of answering protocol questions from memory.",
      z.object({ topic: z.enum(["level", "drift", "rebalancing", "costs", "modes", "stocks"]) }),
      async ({ topic }) => ({ result: { topic, text: GLOSSARY[topic] } }),
    ),
  ];
  return tools as unknown as ToolDef<z.ZodType>[];
}

/** Run a tool call, validating its input; failures come back as error results, never thrown. */
export async function runTool(tools: ToolDef<z.ZodType>[], name: string, input: unknown, ctx: ToolCtx): Promise<ToolOutput & { isError: boolean }> {
  const t = tools.find((x) => x.spec.name === name);
  if (!t) return { result: { error: `unknown tool ${name}` }, isError: true };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) return { result: { error: "INVALID_INPUT", issues: parsed.error.issues.map((i) => i.message) }, isError: true };
  try {
    const out = await t.run(parsed.data, ctx);
    const isError = typeof out.result === "object" && out.result !== null && "error" in out.result;
    return { ...out, isError };
  } catch (e) {
    return { result: { error: e instanceof Error ? e.message : String(e) }, isError: true };
  }
}
