import { describe, expect, it } from "vitest";
import { counts, filterItems, vndS, vndVol, marketItems, marketVM, priceS, sparkPoints, swatch, topMovers, type AssetLite, type BoardRow, type IndexLite } from "../src/ui/market.vm";

const IX = "0x6042ca88e3e606ede6fbcb189c8c6d633a0cf480";
const PRIV = "0x00000000000000000000000000000000000000aa";
const board: BoardRow[] = [
  { id: "wavax", kind: "token", symbol: "AVAX", name: "Wrapped AVAX", price: { usd: 6.51 }, change24h: 0.021, change7d: 0.048, change30d: -0.021, volume24hUsd: 84_200_000 },
  { id: "joe", kind: "token", symbol: "JOE", name: "Joe", price: { usd: 0.00004321 }, change24h: -0.032, volume24hUsd: 2_200_000 },
  { id: "nvda", kind: "stock", symbol: "NVDA", name: "NVIDIA", price: { usd: 169.95 }, change24h: 0.031, change7d: -0.002, change30d: 0.111, volume24hUsd: 12_900_000 },
  { id: "msft", kind: "stock", symbol: "MSFT", name: "Microsoft", price: { usd: 512.4 }, change24h: -0.004, volume24hUsd: 6_100_000 },
  { id: "fpt", kind: "stock", symbol: "FPT", name: "FPT Corporation", price: { usd: 1.7578 }, change24h: 0.016, volume24hUsd: 0 },
  { id: IX, kind: "index", symbol: "CSTK", name: "Crypto Stocks + BTC", stocksPct: 75, level: 98.26, change24h: null, volume24hUsd: 0 },
  { id: PRIV, kind: "index", symbol: "PRIV", name: "Private one", stocksPct: 50, level: 100, change24h: 0.5 },
];
const assets: AssetLite[] = [
  { id: "wavax", displaySymbol: "AVAX", display: { chain: "avalanche", address: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7" }, execution: { address: "0x1111111111111111111111111111111111111111" } },
  { id: "fpt", displaySymbol: "FPT", display: { chain: "hose", address: null }, execution: { address: "0xfe46345b510f2c0373e31a474cae7c358fe42bb1" } },
  { id: "nvda", displaySymbol: "NVDA", display: { chain: "robinhood", address: null }, execution: { address: null } },
];
const indexes: IndexLite[] = [
  { id: IX, ticker: "CSTK", mode: 1, assets: ["0x1", "0x2", "0x3", "0x4"], isPublic: true },
  { id: PRIV, ticker: "PRIV", mode: 0, assets: ["0x1", "0x2"], isPublic: false },
];

describe("marketItems", () => {
  const items = marketItems(board, assets, indexes);
  it("classifies, hides private indexes, orders indexes · stocks · VN stocks · tokens by volume", () => {
    expect(items.map((x) => [x.n, x.type])).toEqual([
      ["Crypto Stocks + BTC", "Index"],
      ["NVDA", "Stock"],
      ["MSFT", "Stock"],
      ["FPT", "VN Stock"],
      ["AVAX", "Token"],
      ["JOE", "Token"],
    ]);
  });
  it("index row: subtitle, level, swatch and link", () => {
    expect(items[0]).toMatchObject({ sub: "CSTK · 4 assets · Manual", px: "98.26", href: `/index/${IX}`, icon: "#F2F2F3", key: IX });
    expect(swatch(20)).toBe("#9052F9");
    expect(swatch(50)).toContain("linear-gradient");
  });
  it("asset rows: logo or initials, HOSE subtitle, prices", () => {
    expect(items.find((x) => x.n === "FPT")?.sub).toBe("FPT Corporation · HOSE");
    expect(items.find((x) => x.n === "NVDA")).toMatchObject({ href: "/asset/nvda", px: "$169.95" });
    expect(priceS(0.00004321)).toBe("$0.0₄4321");
    expect(priceS(74357)).toBe("$74,357");
    expect(priceS(null)).toBe("—");
  });
  it("filters, search by name or contract, watchlist counts", () => {
    const watch = new Set(["nvda", IX]);
    expect(filterItems(items, "VN Stocks", watch, "").map((x) => x.n)).toEqual(["FPT"]);
    expect(filterItems(items, "Watchlist", watch, "").map((x) => x.n)).toEqual(["Crypto Stocks + BTC", "NVDA"]);
    expect(filterItems(items, "All", watch, "microsoft").map((x) => x.n)).toEqual(["MSFT"]);
    expect(filterItems(items, "All", watch, "0xFE46345B").map((x) => x.n)).toEqual(["FPT"]);
    expect(counts(items, watch)).toEqual({ All: 6, Watchlist: 2, Indexes: 1, Stocks: 2, "VN Stocks": 1, Tokens: 2 });
  });
  it("top movers: best 24h per type, null changes never win", () => {
    expect(topMovers(items).map((x) => x.n)).toEqual(["NVDA", "FPT", "AVAX"]);
  });
});

describe("VN prices in đồng (GET /fx)", () => {
  it("prices and volume in ₫ with a rate, USD without", () => {
    const b = board.map((r) => (r.id === "fpt" ? { ...r, price: { usd: 3.7695 }, volume24hUsd: 16_117_187 } : r));
    const withFx = marketVM({ items: marketItems(b, assets, indexes, 25_600), filter: "VN Stocks", q: "", watch: new Set(), sparks: {} });
    expect(withFx.rows[0]).toMatchObject({ px: "96,500 ₫", volS: "412.6B ₫" });
    const noFx = marketVM({ items: marketItems(b, assets, indexes, null), filter: "VN Stocks", q: "", watch: new Set(), sparks: {} });
    expect(noFx.rows[0]).toMatchObject({ px: "$3.77", volS: "$16.1M" });
    expect(marketItems(b, assets, indexes, 25_600).find((x) => x.n === "NVDA")?.px).toBe("$169.95");
    expect(vndS(0.3, 25_600)).toBe("7,680 ₫");
    expect(vndVol(0, 25_600)).toBe("0 ₫");
  });
});

describe("marketVM", () => {
  const items = marketItems(board, assets, indexes);
  it("rows, chips and stars", () => {
    const v = marketVM({ items, filter: "All", q: "", watch: new Set(["nvda"]), sparks: { nvda: [1, 2, 3] } });
    const nv = v.rows.find((r) => r.n === "NVDA");
    expect(nv).toMatchObject({ i: 2, d1s: "+3.1%", d7s: "-0.2%", d30s: "+11.1%", c1: "#3DD68C", c7: "#FF6B6B", volS: "$12.9M", on: true, sfill: "#F5B14C", starLabel: "Remove NVDA from watchlist" });
    expect(v.rows[0]).toMatchObject({ d1s: "—", c1: "#8E8E96", tfg: "#B18CFB", starLabel: "Add Crypto Stocks + BTC to watchlist" });
    expect(v.chips.map((c) => [c.label, c.n, c.on])).toEqual([
      ["All", 6, true],
      ["★ Watchlist", 1, false],
      ["Indexes", 1, false],
      ["Stocks", 2, false],
      ["VN Stocks", 1, false],
      ["Tokens", 2, false],
    ]);
    expect(v.movers[0]).toMatchObject({ n: "NVDA", kind: "Top stock", d: "+3.1%", dfg: "#3DD68C", pts: "1.0,33.0 55.0,18.0 109.0,3.0" });
    expect(v.movers.find((m) => m.n === "AVAX")?.pts).toBe("");
  });
  it("sparkline needs two points", () => {
    expect(sparkPoints([5])).toBe("");
  });
});
