import { describe, expect, it } from "vitest";
import { Registry } from "prom-client";
import { createLogger } from "@pantado/service-kit";
import { loadAssets, loadProfile, loadServices, type VnMarket, type VnQuote } from "@pantado/shared";
import { MarketData } from "../src/service.js";
import type { PriceChainReader } from "../src/sources/pricechain.js";
import type { EnginePrice } from "../src/engine/tokens.js";

const quote = (usd: number, ts: number): VnQuote => ({ symbol: "", vnd: usd * 25_600, usd, ts, lastTradeTs: ts, fresh: true, marketOpen: false, change24h: null, change7d: null, change30d: null, sessionValueUsd: null, avgValueUsd: null, sessionVolume: null });
const vn = { quote: (s: string) => (s === "FPT" ? quote(1.75, 900) : s === "VCB" ? quote(1.96, 900) : null) } as unknown as VnMarket;
const md = (priceChain: PriceChainReader | null) =>
  new MarketData({ assets: loadAssets(), profile: loadProfile("contest"), services: loadServices(), mode: "live", avalanche: null, robinhood: null, stockApi: null, vn, priceChain, sink: null, log: createLogger("t"), registry: new Registry(), now: () => 1000 });

describe("Vietnamese prices and the Pantado Price Chain", () => {
  it("with the price chain: canonical = the round finalized on the L1, cross-check = the direct HOSE read", async () => {
    const chain = { prices: async () => new Map<string, EnginePrice>([["fpt", { usd: 1.76, ts: 950, source: "pricechain:0xR#7" }]]) } as unknown as PriceChainReader;
    const r = await md(chain).refresh();
    const fpt = r.prices.find((p) => p.id === "fpt");
    expect(fpt?.canonical).toEqual({ usd: "1.76", ts: 950, source: "pricechain:0xR#7" });
    expect(fpt?.crossCheck).toEqual({ usd: "1.75", ts: 900, source: "hose:last-match" });
    // not finalized on the chain → no canonical price (the pusher skips it; it goes stale by design)
    expect(r.prices.find((p) => p.id === "vcb")).toBeUndefined();
  });

  it("without the price chain: the direct read is canonical, with no cross-check", async () => {
    const r = await md(null).refresh();
    const vcb = r.prices.find((p) => p.id === "vcb");
    expect(vcb?.canonical).toEqual({ usd: "1.96", ts: 900, source: "hose:last-match" });
    expect(vcb?.crossCheck).toBeNull();
  });
});
