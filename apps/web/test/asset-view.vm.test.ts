import { describe, expect, it } from "vitest";
import type { AssetDetail, BoardRowView, IndexView } from "../src/screens/asset.api";
import type { NetworkView } from "../src/screens/network.vm";
import { assetViewVM, exactUsd, hoseSession, holdingIndexes, variantOf, type AssetViewInput } from "../src/ui/asset-view.vm";

const NOW = 1_795_300_000;
const asset = (over: Partial<AssetDetail>): AssetDetail => ({
  id: "wavax",
  symbol: "WAVAX",
  displaySymbol: "AVAX",
  name: "Avalanche",
  kind: "token",
  tier: null,
  decimals: 18,
  color: "#E84142",
  logoURI: null,
  badge: null,
  dataSource: "Avalanche (on-chain)",
  display: { chain: "avalanche", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" },
  execution: { network: "fuji", address: "0x00000000000000000000000000000000000000aa", symbol: "WAVAX" },
  price: { usd: 6.5128, ts: NOW - 2, source: "x", fresh: true },
  risk: null,
  venue: null,
  ...over,
});
const board = (id: string): BoardRowView => ({ id, kind: "token", symbol: "AVAX", name: "Avalanche", change24h: 0.021, change7d: 0.048, change30d: -0.021, volume24hUsd: 84_200_000 });
const ix = (id: string, name: string, assets: string[], bps: number[]): IndexView => ({
  id,
  ticker: name.slice(0, 3).toUpperCase(),
  name,
  description: "",
  creator: "0x1",
  isPublic: true,
  model: "data",
  mode: 1,
  driftBps: 0,
  assets,
  targetBps: bps,
  version: 1,
  supply: "0",
  level: "0",
  value: "0",
  volumeUsdc: "0",
  createdAt: "0",
  badge: null,
});
const base = (over: Partial<AssetViewInput>): AssetViewInput => ({
  asset: asset({}),
  board: board("wavax"),
  daily: { source: null, candles: [{ t: NOW - 91 * 86400, o: 8, h: 8, l: 8, c: 8 }, { t: NOW - 3600, o: 6.4, h: 6.6, l: 6.3, c: 6 }] },
  pools: [
    { kind: "route", name: "Pantado token venue" },
    { kind: "reference", chain: "avalanche", address: "0x1111111111111111111111111111111111111111", dex: "lfj-v2.2" },
  ],
  indexes: [ix("0xi1", "Tech + BTC Balanced", ["0x00000000000000000000000000000000000000AA"], [1500]), ix("0xi2", "Avalanche Blue Chips", ["0xbb", "0x00000000000000000000000000000000000000aa"], [6500, 3500])],
  network: null,
  nowSec: NOW,
  watched: false,
  dtab: "API",
  tab: "Sources",
  apiUrl: "http://api",
  vndPerUsd: null,
  ...over,
});

const NET: NetworkView = {
  chain: { name: "pantadoprice", chainId: 55177, blockchainId: "0x12", head: 100, headAt: NOW - 5, cchainChainId: 1337, cchainHead: 200, icmMessenger: "0xm", priceReports: "0xp", receiver: "0x5DB9A7629912EBF95876228C24A848de0bfB43A9" },
  threshold: 2,
  roundSec: 60,
  lastFinalRound: 29_921_707,
  lastDeliveredRound: 29_921_707,
  reporters: [
    { address: "0x0e073b9b44a3Cff1226FDaaFb4138d54E524E6D2", active: true, lastRound: 29_921_707, lastAt: NOW - 3, maxDeviationBps: 0 },
    { address: "0xD307888260302FD3177A5A8eb88a048fB3A0F804", active: true, lastRound: 29_921_707, lastAt: NOW - 5, maxDeviationBps: 12 },
    { address: "0x3a73Ad3b87545adA574DeD5Ee67d97afD5857CE3", active: false, lastRound: null, lastAt: null, maxDeviationBps: null },
  ],
  rounds: [
    { round: 29_921_707, reporters: ["0x1", "0x2"], assets: 25, finalizedAt: NOW - 30, l1Block: 90, deliveredAt: NOW - 28, cchainBlock: 190, icmDelaySec: 2 },
    { round: 29_921_706, reporters: ["0x1"], assets: 0, finalizedAt: null, l1Block: null, deliveredAt: null, cchainBlock: null, icmDelaySec: null },
  ],
  prices: [{ id: "fpt", l1Usd: 3.7992, l1Round: 29_921_707, cchainUsd: 3.7992, cchainRound: 29_921_707, ts: NOW - 30 }],
};

describe("asset view variants", () => {
  it("picks the variant from kind and display chain", () => {
    expect(variantOf(asset({}))).toBe("token");
    expect(variantOf(asset({ kind: "stock", display: { chain: "robinhood", address: null } }))).toBe("stock");
    expect(variantOf(asset({ kind: "stock", display: { chain: "hose", address: null } }))).toBe("vn");
    expect(variantOf(null)).toBe("token");
  });

  it("token: price, perf, reference pools (no trading venue), indexes holding it", () => {
    const v = assetViewVM(base({}));
    expect(v.type.label).toBe("Token");
    expect(v.source.label).toBe("Avalanche C-Chain (on-chain)");
    expect(v.pair).toBe("AVAX / USDC");
    expect([v.price, v.d24, v.d24c]).toEqual(["$6.51", "+2.1%", "#3DD68C"]);
    expect(v.tiles).toEqual([
      { k: "VOLUME 24H", v: "$84.2M" },
      { k: "IN INDEXES", v: "2" },
    ]);
    expect(v.perf.map((p) => p.v)).toEqual(["+2.1%", "+4.8%", "-2.1%", "-25.0%"]);
    expect(v.priceCard.value).toBe("$6.5128");
    expect(v.priceCard.pill.label).toBe("Fresh · 2s ago");
    expect(v.priceCard.rows.find((r) => r.k === "Contract")?.v).toBe("0xB31f…66c7");
    expect(v.tabs).toEqual(["Sources"]);
    expect(v.rows).toHaveLength(1); // the Pantado venue route row is not shown
    expect(v.rows[0]).toMatchObject({ a: "Reference pool", d: "lfj-v2.2", e: "Price source" });
    expect(v.inIdx).toEqual([
      { n: "Avalanche Blue Chips", w: "35%", href: "/index/0xi2" },
      { n: "Tech + BTC Balanced", w: "15%", href: "/index/0xi1" },
    ]);
    expect(v.data.code).toBe("/assets/wavax");
    expect(v.data.copy).toBe("http://api/assets/wavax");
    expect(v.star.label).toBe("Add to watchlist");
  });

  it("stock: the reference-market badge, a stale price is flagged", () => {
    const a = asset({ id: "nvda", displaySymbol: "NVDA", name: "NVIDIA", kind: "stock", badge: "Reference market: On-chain", display: { chain: "robinhood", address: null }, price: { usd: 169.9512, ts: NOW - 7200, source: "x", fresh: false } });
    const v = assetViewVM(base({ asset: a, board: { ...board("nvda"), volume24hUsd: null }, pools: [], dtab: "On-chain", watched: true }));
    expect(v.type.label).toBe("Stock");
    expect(v.source.label).toBe("Reference market: On-chain");
    expect(v.session).toBeNull();
    expect(v.tiles[0]).toEqual({ k: "VOLUME 24H", v: "—" });
    expect(v.priceCard.pill).toMatchObject({ label: "Stale · 2h ago", fg: "#F5B14C" });
    expect(v.rows).toEqual([]);
    expect(v.emptyRows).toContain("No confirmed reference pool");
    expect(v.data.code).toBe("PriceOracle.getPrice(NVDA)\n// 169.9512e18");
    expect(v.star).toEqual({ on: true, label: "In watchlist" });
  });

  it("VN stock: price chain provenance, reporters and rounds", () => {
    const a = asset({ id: "fpt", displaySymbol: "FPT", name: "FPT Corporation", kind: "stock", badge: "Reference market: HOSE (off-chain)", display: { chain: "hose", address: null }, price: { usd: 3.7992, ts: NOW - 30, source: "pricechain", fresh: true } });
    const v = assetViewVM(base({ asset: a, board: board("fpt"), pools: [], network: NET }));
    expect(v.type).toMatchObject({ label: "VN Stock", fg: "#2FC7C0" });
    expect(v.source.label).toBe("Reference market: HOSE (off-chain)");
    expect(v.session?.label).toMatch(/^HOSE (open|closed) · \d\d:\d\d ICT$/);
    expect(v.pair).toBe("FPT · HOSE");
    expect(v.tiles.map((t) => t.k)).toEqual(["VOLUME 24H", "PRICE BAND", "IN INDEXES"]);
    expect(v.priceCard.title).toBe("Median, round #29,921,707");
    expect(v.priceCard.value).toBe("$3.7992");
    expect(v.priceCard.pill.label).toBe("In sync");
    expect(v.priceCard.rows.map((r) => [r.k, r.v])).toEqual([
      ["Source", "HOSE matched trades"],
      ["Reported by", "2 of 2 reporters, median"],
      ["To C-Chain", "Avalanche ICM · 2s after final"],
      ["Age", "30s ago"],
    ]);
    expect(v.priceCard.networkLink).toBe(true);
    expect(v.tabs).toEqual(["Sources", "Updates"]);
    expect(v.rows.map((r) => r.a)).toEqual(["0x0e07…E6D2", "0xD307…F804"]); // removed reporter not listed
    expect(v.rows[1]?.c).toBe("0.12% from median");
    const u = assetViewVM(base({ asset: a, pools: [], network: NET, tab: "Updates", dtab: "On-chain" }));
    expect(u.rows.map((r) => [r.b, r.c, r.e])).toEqual([
      ["#29,921,707", "$3.7992", "Delivered"],
      ["#29,921,706", "—", "Collecting"],
    ]);
    expect(u.data.code).toBe('PriceChainReceiver.priceOf("fpt")\n// 3.7992e18 · round 29,921,707');
    const noNet = assetViewVM(base({ asset: a, pools: [], network: null }));
    expect(noNet.rows).toEqual([]);
    expect(noNet.emptyRows).toContain("not configured");
    expect(noNet.priceCard.pill.label).toBe("No round yet");
  });
});

describe("VN stock in ₫", () => {
  const a = asset({ id: "fpt", displaySymbol: "FPT", name: "FPT Corporation", kind: "stock", badge: "Reference market: HOSE (off-chain)", display: { chain: "hose", address: null }, price: { usd: 3.8, ts: NOW - 30, source: "pricechain", fresh: true } });
  it("price, 24h move, volume and the FX row with the /fx rate", () => {
    const v = assetViewVM(base({ asset: a, board: { ...board("fpt"), change24h: 0.016, volume24hUsd: 16_250_000 }, pools: [], network: NET, vndPerUsd: 25_400 }));
    expect([v.price, v.priceSub]).toEqual(["96,520 ₫", "≈ $3.80"]);
    expect(v.d24Sub).toBe("+1,520 ₫");
    expect(v.tiles[0]).toEqual({ k: "VOLUME 24H", v: "412.8B ₫" });
    expect(v.priceCard.rows.find((r) => r.k === "FX")?.v).toBe("USD / VND 25,400");
    expect(v.fx).toBe(25_400);
  });
  it("falls back to USD without a rate; other variants never convert", () => {
    const v = assetViewVM(base({ asset: a, pools: [], network: NET, vndPerUsd: null }));
    expect([v.price, v.priceSub, v.d24Sub, v.fx]).toEqual(["$3.80", null, null, null]);
    expect(v.priceCard.rows.some((r) => r.k === "FX")).toBe(false);
    expect(assetViewVM(base({ vndPerUsd: 25_400 })).price).toBe("$6.51");
  });
});

describe("helpers", () => {
  it("HOSE session in ICT on weekdays", () => {
    // Fri 2026-11-20 03:00 UTC = 10:00 ICT (open); 05:00 UTC = 12:00 ICT (lunch); Sat closed
    expect(hoseSession(Date.UTC(2026, 10, 20, 3, 0) / 1000)).toEqual({ open: true, label: "HOSE open · 10:00 ICT" });
    expect(hoseSession(Date.UTC(2026, 10, 20, 5, 0) / 1000).open).toBe(false);
    expect(hoseSession(Date.UTC(2026, 10, 21, 3, 0) / 1000).open).toBe(false);
  });
  it("exact canonical price and indexes holding an asset", () => {
    expect(exactUsd(169.95123)).toBe("$169.9512");
    expect(exactUsd(74_357.1)).toBe("$74,357.10");
    expect(exactUsd(null)).toBe("—");
    expect(holdingIndexes(null, [])).toEqual([]);
  });
});
