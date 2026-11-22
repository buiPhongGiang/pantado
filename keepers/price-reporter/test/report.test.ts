import { describe, expect, it } from "vitest";
import { hexToString } from "viem";
import type { VnQuote } from "@pantado/shared";
import { assetKey, buildReport, toE18 } from "../src/report.js";

const q = (usd: number, ts: number): VnQuote => ({ symbol: "", vnd: usd * 25_600, usd, ts, lastTradeTs: ts, fresh: true, marketOpen: false, change24h: null, change7d: null, change30d: null, sessionValueUsd: null, avgValueUsd: null, sessionVolume: null });

describe("price report", () => {
  it("keys assets by their registry id as bytes32 (same as cast format-bytes32-string)", () => {
    expect(assetKey("fpt")).toBe("0x6670740000000000000000000000000000000000000000000000000000000000");
    expect(hexToString(assetKey("vcb"), { size: 32 })).toBe("vcb");
  });

  it("scales USD to 1e18 and rejects non-prices", () => {
    expect(toE18(1.7578125)).toBe(1_757_812_500_000_000_000n);
    expect(toE18(0.5)).toBe(500_000_000_000_000_000n);
    expect(() => toE18(0)).toThrow();
    expect(() => toE18(Number.NaN)).toThrow();
  });

  it("reports every asset with a quote, sorted by id, skipping the rest", () => {
    const assets = [{ id: "vcb", symbol: "VCB" }, { id: "fpt", symbol: "FPT" }, { id: "hpg", symbol: "HPG" }];
    const quotes: Record<string, VnQuote | null> = { FPT: q(1.76, 100), VCB: q(1.96, 101), HPG: null };
    const r = buildReport(assets, (s) => quotes[s] ?? null);
    expect(r.ids.map((x) => hexToString(x, { size: 32 }))).toEqual(["fpt", "vcb"]);
    expect(r.prices).toEqual([1_760_000_000_000_000_000n, 1_960_000_000_000_000_000n]);
    expect(r.ts).toEqual([100n, 101n]);
  });
});
