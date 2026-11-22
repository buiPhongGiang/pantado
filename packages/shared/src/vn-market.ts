import type { VnMarketFile } from "./schemas/vn-market.js";

/**
 * Vietnamese stocks (assets with `display.chain: "hose"`, source settings in config/vn-market.json).
 *
 * Prices and volumes come from HOSE matched trades, read from a chart API every `pollSec` while the market is open,
 * and are converted from VND to USD at the configured bank rate. The canonical price is the last matched price: in
 * session it carries the time of that trade (no trade for `maxAgeSec` → the pusher stops and the price goes stale by
 * design); outside the session the last close is the valid price and carries the current time.
 */

export interface VnBar {
  /** bar open, unix seconds */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** shares */
  v: number;
}

export interface VnQuote {
  symbol: string;
  /** last matched price, VND */
  vnd: number;
  usd: number;
  /** price time: the last matched trade in session, now outside it */
  ts: number;
  /** time of the last matched trade, unix seconds */
  lastTradeTs: number;
  /** false only while the market is open and no trade arrived within `staleInSessionSec` */
  fresh: boolean;
  marketOpen: boolean;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  /** latest session's traded value, USD */
  sessionValueUsd: number | null;
  /** average daily traded value over `volumeSessions` sessions, USD */
  avgValueUsd: number | null;
  /** latest session's volume, shares */
  sessionVolume: number | null;
}

export type FetchFn = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

interface ChartReply {
  s: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
}

const DAY = 86_400;

/** Bars from a TradingView-style reply; prices scaled to VND. Bad rows are dropped. */
export function parseChart(raw: string, unitVnd: number): VnBar[] {
  const d = JSON.parse(raw) as ChartReply;
  if (d.s !== "ok" || !d.t) return [];
  const out: VnBar[] = [];
  d.t.forEach((t, i) => {
    const bar = { t, o: (d.o?.[i] ?? 0) * unitVnd, h: (d.h?.[i] ?? 0) * unitVnd, l: (d.l?.[i] ?? 0) * unitVnd, c: (d.c?.[i] ?? 0) * unitVnd, v: d.v?.[i] ?? 0 };
    if ([bar.o, bar.h, bar.l, bar.c].every((x) => Number.isFinite(x) && x > 0) && Number.isFinite(bar.v) && bar.v >= 0) out.push(bar);
  });
  return out.sort((a, b) => a.t - b.t);
}

/** VND per USD from the Vietcombank rate sheet (`<Exrate CurrencyCode="USD" ... Transfer="25,600.00" />`). */
export function parseVcbRate(xml: string, field: "Buy" | "Transfer" | "Sell"): number | null {
  const tag = /<Exrate\s[^>]*CurrencyCode="USD"[^>]*>/i.exec(xml)?.[0];
  if (!tag) return null;
  const m = new RegExp(`${field}="([0-9.,]+)"`).exec(tag);
  if (!m?.[1]) return null;
  const v = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(v) && v > 1000 ? v : null;
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Whether matched trading is running at `nowSec` (session days, open–close, minus breaks). */
export function marketOpen(session: VnMarketFile["session"], nowSec: number): boolean {
  const local = new Date((nowSec + session.timezoneOffsetMin * 60) * 1000);
  if (!session.days.includes(local.getUTCDay())) return false;
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (m < minutes(session.open) || m >= minutes(session.close)) return false;
  return !session.breaks.some(([a, b]) => m >= minutes(a) && m < minutes(b));
}

/** Start of the local trading day holding `nowSec`, unix seconds. */
export function localDayStart(offsetMin: number, nowSec: number): number {
  const off = offsetMin * 60;
  return Math.floor((nowSec + off) / DAY) * DAY - off;
}

/** Daily bars with today's bar rebuilt from the intraday bars when there are any (they are newer). */
export function mergeToday(daily: VnBar[], intraday: VnBar[], offsetMin: number): VnBar[] {
  if (!intraday.length) return daily;
  const day = localDayStart(offsetMin, intraday[intraday.length - 1]!.t);
  const today = intraday.filter((b) => b.t >= day);
  if (!today.length) return daily;
  const bar: VnBar = {
    t: day + offsetMin * 60, // daily bars are stamped 00:00 UTC of the local date
    o: today[0]!.o,
    h: Math.max(...today.map((b) => b.h)),
    l: Math.min(...today.map((b) => b.l)),
    c: today[today.length - 1]!.c,
    v: today.reduce((s, b) => s + b.v, 0),
  };
  const before = daily.filter((b) => localDayStart(offsetMin, b.t) < day);
  return [...before, bar];
}

/** Quote for one stock from its daily bars (oldest first, today merged) and the last intraday bar. */
export function quoteOf(
  symbol: string,
  daily: VnBar[],
  lastTick: VnBar | null,
  vndPerUsd: number,
  cfg: VnMarketFile,
  nowSec: number,
): VnQuote | null {
  const last = daily[daily.length - 1];
  if (!last || !(vndPerUsd > 0)) return null;
  const vnd = lastTick && lastTick.t >= last.t ? lastTick.c : last.c;
  const ts = lastTick && lastTick.t >= last.t ? lastTick.t + 60 : last.t;
  const open = marketOpen(cfg.session, nowSec);
  const fresh = !open || nowSec - ts <= cfg.session.staleInSessionSec;
  // closed market: the last close is the current price (spec §8 addendum, OPEN_QUESTIONS B98)
  const asOf = open ? ts : nowSec;
  const closeAtOrBefore = (sec: number): number | null => {
    for (let i = daily.length - 1; i >= 0; i--) if (daily[i]!.t <= sec) return daily[i]!.c;
    return null;
  };
  const prev = daily.length >= 2 ? daily[daily.length - 2]!.c : null;
  const ch = (base: number | null): number | null => (base && base > 0 ? vnd / base - 1 : null);
  const n = cfg.source.volumeSessions;
  const recent = daily.slice(-n);
  const value = (b: VnBar): number => (b.c * b.v) / vndPerUsd;
  return {
    symbol,
    vnd,
    usd: vnd / vndPerUsd,
    ts: asOf,
    lastTradeTs: ts,
    fresh,
    marketOpen: open,
    change24h: ch(prev),
    change7d: ch(closeAtOrBefore(last.t - 7 * DAY)),
    change30d: ch(closeAtOrBefore(last.t - 30 * DAY)),
    sessionValueUsd: value(last),
    avgValueUsd: recent.length ? recent.reduce((s, b) => s + value(b), 0) / recent.length : null,
    sessionVolume: last.v,
  };
}

/** Weekly bars (weeks start Monday, local time) from daily bars. */
export function weekly(daily: VnBar[], offsetMin: number): VnBar[] {
  const off = offsetMin * 60;
  const out = new Map<number, VnBar>();
  for (const b of daily) {
    const local = b.t + off;
    const wk = Math.floor((local - 4 * DAY) / (7 * DAY)) * 7 * DAY + 4 * DAY - off; // epoch day 0 is a Thursday
    const w = out.get(wk);
    if (!w) out.set(wk, { ...b, t: wk });
    else {
      w.h = Math.max(w.h, b.h);
      w.l = Math.min(w.l, b.l);
      w.c = b.c;
      w.v += b.v;
    }
  }
  return [...out.values()];
}

/** Bars of `sec` seconds from 1-minute bars. */
export function bucket(bars: VnBar[], sec: number): VnBar[] {
  const out = new Map<number, VnBar>();
  for (const b of bars) {
    const t = Math.floor(b.t / sec) * sec;
    const x = out.get(t);
    if (!x) out.set(t, { ...b, t });
    else {
      x.h = Math.max(x.h, b.h);
      x.l = Math.min(x.l, b.l);
      x.c = b.c;
      x.v += b.v;
    }
  }
  return [...out.values()];
}

export class VnMarket {
  private readonly bySymbol = new Map<string, { daily: VnBar[]; intraday: VnBar[] }>();
  private readonly idToSymbol = new Map<string, string>();
  private fx: { vndPerUsd: number; at: number } | null = null;
  private timers: NodeJS.Timeout[] = [];
  private dailyAt = 0;

  constructor(
    readonly cfg: VnMarketFile,
    /** the Vietnamese stocks of config/assets.json */
    stocks: { id: string; symbol: string }[],
    private readonly fetchFn: FetchFn = fetch as unknown as FetchFn,
    private readonly nowSec: () => number = () => Math.floor(Date.now() / 1000),
    private readonly log: (msg: string, extra?: Record<string, unknown>) => void = () => {},
  ) {
    for (const s of stocks) {
      this.bySymbol.set(s.symbol, { daily: [], intraday: [] });
      this.idToSymbol.set(s.id, s.symbol);
    }
  }

  ids(): string[] {
    return [...this.idToSymbol.keys()];
  }

  symbolOf(id: string): string | null {
    return this.idToSymbol.get(id.toLowerCase()) ?? null;
  }

  vndPerUsd(): number | null {
    return this.fx?.vndPerUsd ?? null;
  }

  /** First load, then: FX every `fx.refreshSec`, daily bars every `dailyRefreshSec`, intraday every `pollSec` while open. */
  async start(): Promise<void> {
    await this.refreshFx();
    await this.refreshDaily();
    await this.refreshIntraday();
    this.timers.push(setInterval(() => void this.refreshFx(), this.cfg.fx.refreshSec * 1000));
    this.timers.push(
      setInterval(() => {
        const now = this.nowSec();
        if (marketOpen(this.cfg.session, now)) void this.refreshIntraday();
        if (now - this.dailyAt >= this.cfg.source.dailyRefreshSec) void this.refreshDaily();
      }, this.cfg.source.pollSec * 1000),
    );
    for (const t of this.timers) t.unref();
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private async get(url: string): Promise<string | null> {
    try {
      const r = await this.fetchFn(url, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) {
        this.log("vn fetch failed", { url, status: r.status });
        return null;
      }
      return await r.text();
    } catch (e) {
      this.log("vn fetch failed", { url, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  private chartUrl(symbol: string, resolution: string, from: number, to: number): string {
    const u = new URL(this.cfg.source.baseUrl);
    u.searchParams.set("resolution", resolution);
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("from", String(from));
    u.searchParams.set("to", String(to));
    return u.toString();
  }

  async refreshFx(): Promise<void> {
    const xml = await this.get(this.cfg.fx.url);
    const rate = xml ? parseVcbRate(xml, this.cfg.fx.rate) : null;
    if (rate) this.fx = { vndPerUsd: rate, at: this.nowSec() };
  }

  /** Runs `fn` over every symbol, a few at a time. */
  private async each(fn: (symbol: string) => Promise<void>): Promise<void> {
    const syms = [...this.bySymbol.keys()];
    for (let i = 0; i < syms.length; i += 5) await Promise.all(syms.slice(i, i + 5).map(fn));
  }

  async refreshDaily(): Promise<void> {
    const to = this.nowSec();
    const from = to - this.cfg.source.dailyLookbackDays * DAY;
    await this.each(async (symbol) => {
      const raw = await this.get(this.chartUrl(symbol, "D", from, to));
      if (!raw) return;
      try {
        const bars = parseChart(raw, this.cfg.source.priceUnitVnd);
        if (bars.length) this.bySymbol.get(symbol)!.daily = bars;
      } catch {
        this.log("vn daily parse failed", { symbol });
      }
    });
    this.dailyAt = to;
  }

  async refreshIntraday(): Promise<void> {
    const to = this.nowSec();
    const from = localDayStart(this.cfg.session.timezoneOffsetMin, to) - 4 * DAY;
    await this.each(async (symbol) => {
      const raw = await this.get(this.chartUrl(symbol, "1", from, to));
      if (!raw) return;
      try {
        const bars = parseChart(raw, this.cfg.source.priceUnitVnd);
        if (bars.length) this.bySymbol.get(symbol)!.intraday = bars;
      } catch {
        this.log("vn intraday parse failed", { symbol });
      }
    });
  }

  private dailyOf(symbol: string): VnBar[] {
    const s = this.bySymbol.get(symbol);
    return s ? mergeToday(s.daily, s.intraday, this.cfg.session.timezoneOffsetMin) : [];
  }

  quote(symbol: string): VnQuote | null {
    const s = this.bySymbol.get(symbol);
    const fx = this.vndPerUsd();
    if (!s || !fx) return null;
    return quoteOf(symbol, this.dailyOf(symbol), s.intraday[s.intraday.length - 1] ?? null, fx, this.cfg, this.nowSec());
  }

  /** Candles in USD at today's rate (oldest first): 1d / 1w from daily bars, shorter intervals from the last days' 1-minute bars. */
  candles(symbol: string, intervalSec: number, limit: number): { t: number; o: number; h: number; l: number; c: number; v: number }[] {
    const fx = this.vndPerUsd();
    const s = this.bySymbol.get(symbol);
    if (!fx || !s) return [];
    const off = this.cfg.session.timezoneOffsetMin;
    const bars = intervalSec >= 604_800 ? weekly(this.dailyOf(symbol), off) : intervalSec >= DAY ? this.dailyOf(symbol) : bucket(s.intraday, intervalSec);
    return bars.slice(-limit).map((b) => ({ t: b.t, o: b.o / fx, h: b.h / fx, l: b.l / fx, c: b.c / fx, v: b.v }));
  }
}
