import { describe, expect, it } from "vitest";
import { networkVM, type NetworkView } from "../src/screens/network.vm";
import type { AssetView, IndexView } from "../src/screens/asset.api";

const NOW = 1_800_000_000;
const R = 30_000_000; // round number (60 s rounds)
const view = (o: Partial<NetworkView> = {}): NetworkView => ({
  chain: { name: "pantadoprice", chainId: 55177, blockchainId: "0x12", head: 40, headAt: NOW - 10, cchainChainId: 1337, cchainHead: 17, icmMessenger: "0x253b", priceReports: "0x4ac1", receiver: "0x5db9" },
  threshold: 2,
  roundSec: 60,
  lastFinalRound: R,
  lastDeliveredRound: R,
  reporters: [
    { address: "0x0e073b9b44a3Cff1226FDaaFb4138d54E524E6D2", active: true, lastRound: R, lastAt: NOW - 20, maxDeviationBps: 12 },
    { address: "0xD307888260302FD3177A5A8eb88a048fB3A0F804", active: true, lastRound: R, lastAt: NOW - 15, maxDeviationBps: 450 },
    { address: "0x3a73Ad3b87545adA574DeD5Ee67d97afD5857CE3", active: true, lastRound: null, lastAt: null, maxDeviationBps: null },
  ],
  rounds: [
    { round: R, reporters: ["0x0e073b9b44a3Cff1226FDaaFb4138d54E524E6D2", "0xD307888260302FD3177A5A8eb88a048fB3A0F804"], assets: 25, finalizedAt: NOW - 15, l1Block: 40, deliveredAt: NOW - 13, cchainBlock: 17, icmDelaySec: 2 },
    { round: R - 1, reporters: ["0x0e073b9b44a3Cff1226FDaaFb4138d54E524E6D2"], assets: 0, finalizedAt: null, l1Block: null, deliveredAt: null, cchainBlock: null, icmDelaySec: null },
  ],
  prices: [
    { id: "fpt", l1Usd: 1.7578125, l1Round: R, cchainUsd: 1.7578125, cchainRound: R, ts: NOW - 20 },
    { id: "vcb", l1Usd: 1.96, l1Round: R, cchainUsd: 1.95, cchainRound: R - 1, ts: NOW - 80 },
    { id: "hpg", l1Usd: null, l1Round: null, cchainUsd: null, cchainRound: null, ts: null },
  ],
  ...o,
});
const asset = (id: string, sym: string, exec: string): AssetView =>
  ({ id, symbol: sym, displaySymbol: sym, name: `${sym} name`, kind: "stock", color: "#123456", execution: { network: "fuji", address: exec, symbol: `p${sym}` } }) as unknown as AssetView;
const ix = (name: string, assets: string[], bps: number[]): IndexView => ({ id: `0x${name}`, ticker: name.toUpperCase(), name, assets, targetBps: bps, level: "101500000000000000000" }) as unknown as IndexView;

describe("networkVM", () => {
  const assets = [asset("fpt", "FPT", "0xF1"), asset("vcb", "VCB", "0xV1"), asset("nvda", "NVDA", "0xN1")];

  it("summarises the chain: last round, reporters and threshold, ICM sync, head", () => {
    const v = networkVM(view(), assets, [], NOW);
    expect(v.stats.map((s) => s.label)).toEqual(["Last final round", "Reporters", "ICM to C-Chain", "L1 head"]);
    expect(v.stats[1]).toMatchObject({ value: "3", sub: "2 of 3 needed to finalize", tone: "good" });
    expect(v.stats[2]).toMatchObject({ value: "In sync", sub: "average 2.0s after finalization", tone: "good" });
    expect(networkVM(view({ lastDeliveredRound: R - 4 }), assets, [], NOW).stats[2]).toMatchObject({ value: "4 behind", tone: "bad" });
  });

  it("labels rounds delivered, final on the L1, or still collecting", () => {
    const v = networkVM(view(), assets, [], NOW);
    expect(v.rounds[0]).toMatchObject({ round: `#${R.toLocaleString("en-US")}`, line: "Delivered · 2s", status: "Delivered", tone: "good", delay: "2s", assets: "25", reporters: ["0x0e07…E6D2", "0xD307…F804"] });
    expect(v.rounds[1]).toMatchObject({ status: "Collecting", line: "Collecting", tone: "idle", delay: "—" });
  });

  it("rates reporters by freshness and by their gap from the median", () => {
    const v = networkVM(view(), assets, [], NOW);
    expect(v.reporters[0]).toMatchObject({ status: "Reporting", tone: "good", gap: "0.12%", gapTone: "good" });
    expect(v.reporters[1]).toMatchObject({ gap: "4.50%", gapTone: "bad" });
    expect(v.reporters[2]).toMatchObject({ status: "Waiting", tone: "idle", gap: "—", seen: "waiting" });
    expect(v.reporters[0]).toMatchObject({ addr: "0x0e07…E6D2" });
  });

  it("shows each price on the L1 and the C-Chain and whether they are in sync", () => {
    const v = networkVM(view(), assets, [], NOW);
    expect(v.prices[0]).toMatchObject({ sym: "FPT", name: "FPT name", l1: "$1.7578", cchain: "$1.7578", status: "In sync", tone: "good" });
    expect(v.prices[1]).toMatchObject({ status: "Behind", tone: "warn" });
    expect(v.prices[2]).toMatchObject({ l1: "—", status: "No round yet", tone: "idle" });
    expect(v.prices[0]).toMatchObject({ px: "$1.7578" });
    expect(v.prices[1]!.note.startsWith("Behind · ")).toBe(true);
  });

  it("lists the indexes whose value uses price-chain assets, by their weight", () => {
    const v = networkVM(view(), assets, [ix("us", ["0xN1"], [10_000]), ix("mix", ["0xf1", "0xN1"], [3000, 7000]), ix("vn", ["0xF1", "0xV1"], [5000, 5000])], NOW);
    expect(v.indexes.map((x) => [x.name, x.vnWeight, x.level])).toEqual([["vn", "100%", "101.50"], ["mix", "30%", "101.50"]]);
  });

  it("builds the flow strip: reporters, final on L1, ICM delivery, prices on the C-Chain", () => {
    const v = networkVM(view(), assets, [], NOW);
    expect(v.stages.map((s) => [s.label, s.value, s.tone])).toEqual([
      ["Reporters", "2 / 3", "good"],
      ["Final on L1", `#${R.toLocaleString("en-US")}`, "good"],
      ["ICM delivery", "2.0s", "good"],
      ["On C-Chain", "1 / 2", "warn"],
    ]);
    expect(v.stages[3]?.note).toBe("1 price behind");
    expect(v.footer).toBe("2 of 3 reporters · median per asset · 60s rounds · delivered to the C-Chain over Avalanche ICM");
  });
});
