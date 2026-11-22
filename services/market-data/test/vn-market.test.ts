import { describe, expect, it } from "vitest";
import { loadAssets, loadVnMarket, type VnMarketFile } from "@pantado/shared";
import { bucket, localDayStart, marketOpen, mergeToday, parseChart, parseVcbRate, quoteOf, VnMarket, weekly, type FetchFn, type VnBar } from "@pantado/shared";

const cfg = loadVnMarket() as VnMarketFile;
const vnStocks = loadAssets()
  .filter((a) => a.kind === "stock" && a.display.chain === "hose")
  .map((a) => ({ id: a.id, symbol: a.symbol }));
const ICT = cfg.session.timezoneOffsetMin * 60;
/** unix seconds of a local (ICT) wall-clock time */
const ict = (y: number, mo: number, d: number, h = 0, mi = 0): number => Date.UTC(y, mo - 1, d, h, mi) / 1000 - ICT;
/** daily bar stamped 00:00 UTC of the local date, like the chart API */
const day = (y: number, mo: number, d: number, c: number, v = 1000): VnBar => ({ t: Date.UTC(y, mo - 1, d) / 1000, o: c, h: c, l: c, c, v });

describe("vn-market config", () => {
  it("loads, and assets.json lists 25 HOSE stocks", () => {
    expect(cfg).not.toBeNull();
    expect(vnStocks).toHaveLength(25);
    expect(vnStocks.every((s) => s.id === s.symbol.toLowerCase())).toBe(true);
  });
});

describe("parsers", () => {
  it("scales chart prices to VND and drops bad rows", () => {
    const raw = JSON.stringify({ s: "ok", t: [2, 1, 3], o: [45, 44, 0], h: [45.5, 44.5, 1], l: [44.8, 43.9, 1], c: [45, 44.2, 1], v: [100, 200, 300] });
    const bars = parseChart(raw, 1000);
    expect(bars.map((b) => b.t)).toEqual([1, 2]);
    expect(bars[1]).toEqual({ t: 2, o: 45_000, h: 45_500, l: 44_800, c: 45_000, v: 100 });
    expect(parseChart(JSON.stringify({ s: "no_data" }), 1000)).toEqual([]);
  });

  it("reads the USD row of the bank rate sheet", () => {
    const xml = `<ExrateList><Exrate CurrencyCode="EUR" Buy="29,000.00" Transfer="29,100.00" Sell="30,000.00" />
      <Exrate CurrencyCode="USD" CurrencyName="US DOLLAR" Buy="25,570.00" Transfer="25,600.00" Sell="25,980.00" /></ExrateList>`;
    expect(parseVcbRate(xml, "Transfer")).toBe(25_600);
    expect(parseVcbRate(xml, "Sell")).toBe(25_980);
    expect(parseVcbRate("<ExrateList />", "Transfer")).toBeNull();
  });
});

describe("session", () => {
  it("is open on weekday hours, closed at lunch, after close and at weekends", () => {
    expect(marketOpen(cfg.session, ict(2026, 11, 20, 10, 0))).toBe(true); // Friday
    expect(marketOpen(cfg.session, ict(2026, 11, 20, 12, 0))).toBe(false); // lunch
    expect(marketOpen(cfg.session, ict(2026, 11, 20, 13, 0))).toBe(true);
    expect(marketOpen(cfg.session, ict(2026, 11, 20, 15, 0))).toBe(false);
    expect(marketOpen(cfg.session, ict(2026, 11, 20, 8, 59))).toBe(false);
    expect(marketOpen(cfg.session, ict(2026, 11, 22, 10, 0))).toBe(false); // Sunday
  });

  it("finds the local day start", () => {
    expect(localDayStart(cfg.session.timezoneOffsetMin, ict(2026, 11, 20, 14, 45))).toBe(ict(2026, 11, 20));
    expect(localDayStart(cfg.session.timezoneOffsetMin, ict(2026, 11, 20, 0, 30))).toBe(ict(2026, 11, 20));
  });
});

describe("bars", () => {
  it("rebuilds today's daily bar from 1-minute bars", () => {
    const daily = [day(2026, 11, 19, 44_000), day(2026, 11, 20, 44_500)];
    const intra: VnBar[] = [
      { t: ict(2026, 11, 20, 9, 15), o: 44_100, h: 44_400, l: 44_000, c: 44_300, v: 10 },
      { t: ict(2026, 11, 20, 14, 45), o: 44_900, h: 45_100, l: 44_900, c: 45_000, v: 30 },
    ];
    const m = mergeToday(daily, intra, cfg.session.timezoneOffsetMin);
    expect(m).toHaveLength(2);
    expect(m[1]).toEqual({ t: Date.UTC(2026, 10, 20) / 1000, o: 44_100, h: 45_100, l: 44_000, c: 45_000, v: 40 });
    expect(mergeToday(daily, [], cfg.session.timezoneOffsetMin)).toBe(daily);
  });

  it("groups weeks from Monday and buckets minutes", () => {
    const d = [day(2026, 11, 13, 10), day(2026, 11, 16, 11), day(2026, 11, 20, 12)]; // Fri, Mon, Fri
    const w = weekly(d, cfg.session.timezoneOffsetMin);
    expect(w).toHaveLength(2);
    expect(w[1]).toMatchObject({ o: 11, c: 12, v: 2000 });
    const b = bucket([{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 1 }, { t: 60, o: 2, h: 3, l: 0.5, c: 1, v: 2 }, { t: 900, o: 5, h: 5, l: 5, c: 5, v: 1 }], 900);
    expect(b).toEqual([{ t: 0, o: 1, h: 3, l: 0.5, c: 1, v: 3 }, { t: 900, o: 5, h: 5, l: 5, c: 5, v: 1 }]);
  });
});

describe("quote", () => {
  const daily: VnBar[] = [];
  for (let i = 40; i >= 0; i--) {
    const t = Date.UTC(2026, 10, 20) / 1000 - i * 86_400;
    const wd = new Date(t * 1000).getUTCDay();
    if (wd !== 0 && wd !== 6) daily.push({ t, o: 1, h: 1, l: 1, c: 40_000 + (40 - i) * 100, v: 1_000_000 });
  }

  it("prices in VND and USD with changes and traded value", () => {
    const now = ict(2026, 11, 22, 10, 0); // Sunday: closed, the last close is valid
    const q = quoteOf("FPT", daily, null, 25_000, cfg, now)!;
    expect(q.vnd).toBe(44_000);
    expect(q.usd).toBeCloseTo(1.76, 6);
    expect(q.fresh).toBe(true);
    expect(q.marketOpen).toBe(false);
    // closed market: the last close is the current price, stamped now so the pusher keeps it fresh on-chain
    expect(q.ts).toBe(now);
    expect(q.lastTradeTs).toBe(daily[daily.length - 1]!.t);
    expect(q.change24h).toBeCloseTo(44_000 / 43_900 - 1, 9);
    expect(q.change7d).toBeCloseTo(44_000 / 43_300 - 1, 9); // Nov 13 close
    expect(q.sessionValueUsd).toBeCloseTo((44_000 * 1_000_000) / 25_000, 3);
    expect(q.avgValueUsd).toBeGreaterThan(0);
  });

  it("is stale only when the market is open and no trade arrived in time", () => {
    const tick: VnBar = { t: ict(2026, 11, 20, 10, 0), o: 44_100, h: 44_100, l: 44_100, c: 44_100, v: 5 };
    const open = quoteOf("FPT", daily, tick, 25_000, cfg, ict(2026, 11, 20, 10, 3))!;
    expect(open.vnd).toBe(44_100);
    expect(open.fresh).toBe(true);
    expect(open.ts).toBe(tick.t + 60); // in session: the time of the last matched trade
    expect(quoteOf("FPT", daily, tick, 25_000, cfg, ict(2026, 11, 20, 10, 30))!.fresh).toBe(false);
    expect(quoteOf("FPT", daily, tick, 25_000, cfg, ict(2026, 11, 20, 12, 0))!.fresh).toBe(true); // lunch
    expect(quoteOf("FPT", [], null, 25_000, cfg, 0)).toBeNull();
  });
});

describe("VnMarket", () => {
  it("loads FX and bars through the fetch it is given", async () => {
    const seen: string[] = [];
    const fake: FetchFn = async (url) => {
      seen.push(url);
      const body = url.includes("Exrate") || url.includes("TyGia")
        ? `<Exrate CurrencyCode="USD" Buy="25,500.00" Transfer="25,600.00" Sell="25,900.00" />`
        : JSON.stringify({ s: "ok", t: [Date.UTC(2026, 10, 19) / 1000, Date.UTC(2026, 10, 20) / 1000], o: [44, 45], h: [44, 45], l: [44, 45], c: [44, 45], v: [100, 200] });
      return { ok: true, status: 200, text: async () => body };
    };
    const m = new VnMarket(cfg, vnStocks, fake, () => ict(2026, 11, 22, 10, 0));
    await m.refreshFx();
    await m.refreshDaily();
    expect(m.vndPerUsd()).toBe(25_600);
    expect(m.symbolOf("fpt")).toBe("FPT");
    expect(m.symbolOf("nvda")).toBeNull();
    const q = m.quote("FPT")!;
    expect(q.vnd).toBe(45_000);
    expect(q.change24h).toBeCloseTo(45 / 44 - 1, 9);
    expect(m.candles("FPT", 86_400, 10)).toHaveLength(2);
    expect(seen.some((u) => u.includes("symbol=FPT") && u.includes("resolution=D"))).toBe(true);
  });

  it("keeps the last data when a fetch fails", async () => {
    let fail = false;
    const fake: FetchFn = async (url) => {
      if (fail) return { ok: false, status: 503, text: async () => "" };
      const body = url.includes("TyGia") ? `<Exrate CurrencyCode="USD" Transfer="25,600.00" />` : JSON.stringify({ s: "ok", t: [1], o: [10], h: [10], l: [10], c: [10], v: [1] });
      return { ok: true, status: 200, text: async () => body };
    };
    const m = new VnMarket(cfg, vnStocks, fake, () => ict(2026, 11, 22, 10, 0));
    await m.refreshFx();
    await m.refreshDaily();
    fail = true;
    await m.refreshFx();
    await m.refreshDaily();
    expect(m.vndPerUsd()).toBe(25_600);
    expect(m.quote("VCB")?.vnd).toBe(10_000);
  });
});
