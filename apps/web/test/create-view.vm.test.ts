import { describe, expect, it } from "vitest";
import type { AssetView } from "../src/screens/asset.api";
import type { CreateState } from "../src/screens/create.vm";
import { basketRows, driftBand, inTab, rules, splitText, summary, universe } from "../src/ui/create-view.vm";

const NOW = 1_763_000_000;
const asset = (id: string, sym: string, kind: AssetView["kind"], chain = "avalanche"): AssetView => ({
  id,
  symbol: sym,
  displaySymbol: sym,
  name: `${sym} name`,
  kind,
  tier: null,
  decimals: 18,
  color: "#76B900",
  logoURI: null,
  badge: null,
  dataSource: "",
  display: { chain, address: null },
  execution: { network: "fuji", address: `0x${id.padStart(40, "0")}`, symbol: sym },
  price: { usd: 1, ts: NOW, source: "x", fresh: true },
  risk: null,
});
const ASSETS = [asset("usdc", "USDC", "quote"), asset("nvda", "NVDA", "stock", "robinhood"), asset("fpt", "FPT", "stock", "hose"), asset("wavax", "AVAX", "token")];
const S: CreateState = { picked: ["nvda", "fpt", "wavax"], w: { nvda: 40, fpt: 20, wavax: 40 }, f: "All", search: "", name: "My basket", ticker: "MYBK", description: "", vis: "Public", mode: "Auto", drift: 50, step: "edit" };

describe("create view model", () => {
  it("filters the universe by type, VN stocks apart, and marks picked assets", () => {
    expect(universe(ASSETS, "All", "", S.picked).map((u) => u.t)).toEqual(["NVDA", "FPT", "AVAX"]);
    expect(universe(ASSETS, "Stocks", "", []).map((u) => u.t)).toEqual(["NVDA"]);
    expect(universe(ASSETS, "VN Stocks", "", []).map((u) => u.t)).toEqual(["FPT"]);
    expect(universe(ASSETS, "Tokens", "", []).map((u) => u.t)).toEqual(["AVAX"]);
    expect(universe(ASSETS, "All", "fp", []).map((u) => u.t)).toEqual(["FPT"]);
    expect(universe(ASSETS, "All", "", ["fpt"])[1]).toMatchObject({ btn: "Added", aria: "Remove FPT", added: true });
    expect(inTab(ASSETS[2] as AssetView, "Stocks")).toBe(false);
  });

  it("basket rows and the stock / VN / token split", () => {
    const rows = basketRows(ASSETS, S);
    expect(rows.map((r) => [r.t, r.k, r.wl])).toEqual([["NVDA", "Stock", "40%"], ["FPT", "VN Stock", "20%"], ["AVAX", "Token", "40%"]]);
    expect(splitText(rows)).toBe("Stocks 40% · VN Stocks 20% · Tokens 40%");
    expect(splitText([])).toBe("Add assets to start");
  });

  it("drift band and rule cells say nothing is traded", () => {
    expect(driftBand(50)).toMatchObject({ lo: "10", hi: "30" });
    expect(rules("Auto", 50).map((r) => r.v)).toEqual(["±50%", "30 days", "Once a day", "Anyone"]);
    expect(rules("Manual", 50)[2]).toEqual({ k: "Applied by", v: "You" });
    expect(rules("Off", 50)).toEqual([]);
  });

  it("summary: no deposit, network fee only; CTA follows validation", () => {
    const v = summary(S, { tickerTaken: false, editing: null, bt: { ret: 0.1, vol: 0.3, dd: -0.2 }, avax: { ret: 0.02, vol: 0.5, dd: -0.3 } });
    expect(v.cta).toEqual({ label: "Review: publish", enabled: true });
    expect(v.rows).toContainEqual({ k: "Cost", v: "Network fee only" });
    expect(v.rows).toContainEqual({ k: "Starting level", v: "100.00" });
    expect([v.ret, v.vol, v.dd, v.vsAvax]).toEqual(["+10.0%", "30%", "-20.0%", "+8.0 pts"]);
    expect(JSON.stringify(v)).not.toMatch(/USDC|first buy|trade fee|You pay/i);
    expect(summary({ ...S, ticker: "" }, { tickerTaken: null, editing: null, bt: null, avax: null }).cta).toEqual({ label: "Add a ticker", enabled: false });
    expect(summary(S, { tickerTaken: true, editing: null, bt: null, avax: null }).cta.enabled).toBe(false);
  });

  it("edit mode: own ticker is not 'taken', level carries over", () => {
    const v = summary(S, { tickerTaken: true, editing: { ticker: "VNL" }, bt: null, avax: null });
    expect(v.cta).toEqual({ label: "Review: update", enabled: true });
    expect(v.reviewTitle).toBe("Review: update VNL");
    expect(v.rows[0]).toEqual({ k: "Level", v: "Carries over" });
  });
});
