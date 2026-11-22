import { describe, expect, it } from "vitest";
import { tickerRuns, type Ticker } from "../src/ui/ask-text";

const tk = (symbol: string, kind: Ticker["kind"] = "token"): [string, Ticker] => [symbol, { symbol, href: `/asset/${symbol.toLowerCase()}`, logo: null, kind }];
const T = new Map([tk("AVAX"), tk("BTC.b"), tk("NVDA", "stock"), tk("FPT", "stock"), tk("VNL", "index")]);

describe("tickerRuns", () => {
  it("turns known tickers into chips, whole words only", () => {
    const r = tickerRuns("NVDA and BTC.b lead; AVAX lags. VNL holds FPT.", T);
    expect(r.filter((x) => x.t === "ticker").map((x) => x.text)).toEqual(["NVDA", "BTC.b", "AVAX", "VNL", "FPT"]);
    expect(r.map((x) => x.text).join("")).toBe("NVDA and BTC.b lead; AVAX lags. VNL holds FPT.");
  });
  it("leaves lookalikes and other case alone", () => {
    const r = tickerRuns("sAVAX, avax, AVAXX and $AVAX are not chips", T);
    expect(r.filter((x) => x.t === "ticker")).toEqual([]);
    expect(tickerRuns("", T)).toEqual([]);
  });
});

import { askBlocks, spans } from "../src/ui/ask-text";

describe("askBlocks / spans", () => {
  it("keeps bold, builds tables and lists", () => {
    const b = askBlocks("All three **fell**.\n\n| | NVDA | AVAX |\n|---|---|---|\n| 30d | -38.5% | -28.0% |\n\n- **NVDA** fell most\n- AVAX second");
    expect(b.map((x) => x.kind)).toEqual(["p", "table", "ul"]);
    expect(b[1]).toEqual({ kind: "table", head: ["", "NVDA", "AVAX"], rows: [["30d", "-38.5%", "-28.0%"]] });
    const s = spans("**NVDA** fell", T);
    expect(s[0]).toMatchObject({ t: "ticker", text: "NVDA", bold: true });
    expect(s[1]).toMatchObject({ t: "text", text: " fell", bold: false });
  });
  it("never turns a currency into a chip", () => {
    const m = new Map(T);
    m.set("VND", { symbol: "VND", href: "/asset/vnd", logo: null, kind: "stock" });
    expect(spans("VND converted to USD", m).every((x) => x.t === "text")).toBe(true);
  });
});
