import { describe, expect, it } from "vitest";
import { indexViewVM, modeTag, priceSource, type IndexViewInput } from "../src/ui/index-view.vm";
import type { AssetView } from "../src/screens/asset.api";
import type { Composition, IndexDetail, Levels } from "../src/screens/index.data";

const NOW = 1_795_300_000;
const E18 = (n: number): string => BigInt(Math.round(n * 1e6)) * 10n ** 12n + "";
const FPT = "0x00000000000000000000000000000000000000f1";
const AVAX = "0x00000000000000000000000000000000000000a1";
const ME = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const asset = (id: string, sym: string, kind: AssetView["kind"], chain: string, addr: string): AssetView => ({
  id,
  symbol: sym,
  displaySymbol: sym,
  name: sym,
  kind,
  tier: null,
  decimals: 18,
  color: "#123456",
  logoURI: null,
  badge: null,
  dataSource: "",
  display: { chain, address: null },
  execution: { network: "local", address: addr, symbol: sym },
  price: null,
  risk: null,
});
const ASSETS = [asset("fpt", "FPT", "stock", "hose", FPT), asset("wavax", "AVAX", "token", "avalanche", AVAX)];

const detail = (over: Partial<IndexDetail> = {}): IndexDetail => ({
  id: "0xabc0000000000000000000000000000000000001",
  ticker: "VNL",
  name: "Vietnam Leaders",
  description: "",
  creator: ME.toLowerCase(),
  model: "data",
  rebalance: { mode: 1, driftBps: 0, intervalSec: 0, rebalancedAt: NOW - 86_400, pending: null, due: "None" },
  isPublic: true,
  mode: 1,
  driftBps: 0,
  assets: [FPT, AVAX],
  targetBps: [6000, 4000],
  version: 2,
  supply: E18(1),
  level: E18(110),
  value: E18(110),
  volumeUsdc: "0",
  createdAt: String(NOW - 40 * 86_400),
  badge: null,
  visibility: "public",
  ...over,
});
const comp: Composition = {
  level: E18(110),
  value: E18(110),
  supply: E18(1),
  maxDriftBps: 300,
  allFresh: true,
  legs: [
    { asset: FPT, id: "fpt", symbol: "FPT", kind: "stock", balance: "0", priceWad: E18(3.77), fresh: true, valueUsdWad: "0", currentBps: 6000, targetBps: 6000, driftBps: 0 },
    { asset: AVAX, id: "wavax", symbol: "AVAX", kind: "token", balance: "0", priceWad: E18(6.5), fresh: true, valueUsdWad: "0", currentBps: 4000, targetBps: 4000, driftBps: 0 },
  ],
};
// one point a day for 40 days, 100 → 110
const levels: Levels = {
  badge: null,
  levels: Array.from({ length: 41 }, (_, k) => ({ block: String(1000 + k), ts: String(NOW - (40 - k) * 86_400), level: E18(100 + k * 0.25) })),
};

const input = (over: Partial<IndexViewInput> = {}): IndexViewInput => ({
  detail: detail(),
  comp,
  levels,
  reb: { plans: [], auctions: [], fills: [], versions: [{ version: 2, targetBps: [6000, 4000], reason: "Tilt to FPT", startAt: String(NOW - 86_400), ts: String(NOW - 86_400) }] },
  txs: [],
  assets: ASSETS,
  board: [{ id: "fpt", change24h: 0.016, change30d: 0.079 }],
  now: NOW,
  me: ME,
  tf: "1D",
  tab: "Composition",
  access: "API",
  env: { apiUrl: "http://api", registry: "0x0B306BF915C4d645ff596e518fAf3F9669b97016", netTag: "Local test chain" },
  ...over,
});

describe("index view model", () => {
  it("header, level, returns and the basket with price sources", () => {
    const v = indexViewVM(input());
    expect([v.name, v.ticker, v.modeTag, v.canEdit, v.isPrivate]).toEqual(["Vietnam Leaders", "VNL", "Manual · creator publishes versions", true, false]);
    expect([v.levelS, v.sinceS]).toEqual(["110.00", "+10.00%"]);
    expect(v.strip.map((s) => s.label)).toEqual(["24H", "7D", "30D", "ALL"]);
    expect(v.strip[3]?.val).toBe("+10.00%");
    expect(v.stats).toEqual([
      { label: "VERSION", val: "2" },
      { label: "ASSETS", val: "2" },
      { label: "VOLATILITY", val: expect.stringMatching(/%$/) },
    ]);
    expect(v.share).toEqual({ stocks: 60, tokens: 40 });
    expect(v.compRows.map((r) => [r.t, r.k, r.w, r.src, r.d])).toEqual([
      ["FPT", "VN Stock", "60%", "Pantado Price Chain (HOSE)", "+1.6%"],
      ["AVAX", "Token", "40%", "Avalanche C-Chain", "—"],
    ]);
    expect(v.tabs.map((t) => t.label)).toEqual(["Composition", "Rebalances", "Verification"]);
    expect(v.chart.empty).toBe(false);
    expect(v.chart.candles.length).toBe(41);
  });

  it("strangers cannot edit; Auto and Off mode tags", () => {
    expect(indexViewVM(input({ me: "0x0000000000000000000000000000000000000009" })).canEdit).toBe(false);
    expect(modeTag(detail({ rebalance: { mode: 2, driftBps: 5000, intervalSec: 2_592_000, rebalancedAt: 0, pending: null, due: "None" } }))).toBe("Auto · ±50% drift or every 30 days");
    expect(modeTag(detail({ mode: 0, rebalance: undefined }))).toBe("Off · weights move with prices");
  });

  it("banner for a scheduled basket, listed in Rebalances", () => {
    const pending = { assets: [FPT, AVAX], weightsBps: [7000, 3000], reason: "More FPT", at: NOW + 48 * 3600 };
    const d = detail({ rebalance: { mode: 1, driftBps: 0, intervalSec: 0, rebalancedAt: NOW, pending, due: "None" } });
    const v = indexViewVM(input({ detail: d, tab: "Rebalances" }));
    expect(v.banner).toEqual({ pill: "Version 3 in 48h", text: "FPT 60 → 70% · AVAX 40 → 30% · More FPT" });
    expect(v.events[0]?.ref).toBe("scheduled");
    expect(v.events.map((e) => e.ref)).toContain("v2");
    expect(v.events[v.events.length - 1]?.what).toBe("Index created at level 100.00");
  });

  it("banner when Auto is due or an asset is dropped", () => {
    const auto = detail({ rebalance: { mode: 2, driftBps: 5000, intervalSec: 2_592_000, rebalancedAt: 0, pending: null, due: "Auto" } });
    expect(indexViewVM(input({ detail: auto })).banner?.pill).toBe("Auto rebalance due");
    const drop = detail({ rebalance: { mode: 1, driftBps: 0, intervalSec: 0, rebalancedAt: 0, pending: null, due: "Drop" } });
    expect(indexViewVM(input({ detail: drop })).banner?.pill).toBe("Asset leaving");
    expect(indexViewVM(input()).banner).toBeNull();
  });

  it("verification compares the indexer level with the recomputed one", () => {
    const v = indexViewVM(input({ tab: "Verification" }));
    expect(v.events.map((e) => e.when)).toEqual(["Indexer", "Recomputed", "Difference", "Prices"]);
    expect(v.events[2]?.ref).toBe("match");
    const behind = indexViewVM(input({ tab: "Verification", comp: { ...comp, level: E18(110.5) } }));
    expect(behind.events[2]?.ref).toBe("behind");
  });

  it("use this data: real request paths and the on-chain read", () => {
    expect(indexViewVM(input()).dcode).toBe("http://api/indexes/0xabc0000000000000000000000000000000000001");
    expect(indexViewVM(input({ access: "History" })).dcode).toBe("http://api/indexes/0xabc0000000000000000000000000000000000001/levels?limit=500");
    const oc = indexViewVM(input({ access: "On-chain" }));
    expect(oc.dcode).toContain("IndexRegistry(0x0B306BF915C4d645ff596e518fAf3F9669b97016).levelOf(0xabc0000000000000000000000000000000000001)");
    expect(oc.dv2).toBe("#1,040");
  });

  it("price source per asset kind", () => {
    expect(priceSource(ASSETS[0]).src).toBe("Pantado Price Chain (HOSE)");
    expect(priceSource(asset("nvda", "NVDA", "stock", "robinhood", "0x1")).src).toBe("On-chain stock");
    expect(priceSource(undefined).src).toBe("—");
  });
});
