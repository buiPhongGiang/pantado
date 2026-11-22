import { describe, expect, it } from "vitest";
import type { IndexView } from "../src/screens/asset.api";
import type { IndexDetail } from "../src/screens/index.data";
import { inScope, rebalanceStatus, rebase, stats, window_, workspaceVM, type Point } from "../src/ui/workspace.vm";

const NOW = 1_795_300_000;
const DAY = 86_400;
const ME = "0x00000000000000000000000000000000000000aa";

const ix = (id: string, over: Partial<IndexView> = {}): IndexView => ({
  id,
  ticker: id.slice(-4).toUpperCase(),
  name: `Index ${id.slice(-4)}`,
  description: "",
  creator: ME,
  isPublic: true,
  model: "data",
  mode: 1,
  driftBps: 0,
  assets: [],
  targetBps: [],
  version: 1,
  supply: "1000000000000000000",
  level: "110000000000000000000",
  value: "0",
  volumeUsdc: "0",
  createdAt: String(NOW - 100 * DAY),
  badge: null,
  ...over,
});
const detail = (r: Partial<NonNullable<IndexDetail["rebalance"]>>): IndexDetail =>
  ({ rebalance: { mode: 2, driftBps: 5000, intervalSec: 30 * DAY, rebalancedAt: NOW - DAY, pending: null, due: "None", ...r } }) as unknown as IndexDetail;
const daily = (vals: number[], end = NOW): Point[] => vals.map((v, i) => ({ ts: end - (vals.length - 1 - i) * DAY, v }));

describe("workspace view model", () => {
  it("scopes: yours (incl. private), watchlist and all public", () => {
    const all = [ix("0x01"), ix("0x02", { isPublic: false }), ix("0x03", { creator: "0xbb" })];
    expect(inScope(all, "Your indexes", ME.toUpperCase(), new Set()).map((x) => x.id)).toEqual(["0x01", "0x02"]);
    expect(inScope(all, "Your indexes", null, new Set())).toEqual([]);
    expect(inScope(all, "Watchlist", null, new Set(["0x03", "0x02"])).map((x) => x.id)).toEqual(["0x03"]);
    expect(inScope(all, "All public", null, new Set()).map((x) => x.id)).toEqual(["0x01", "0x03"]);
  });

  it("windows a series at the period start and rebases it to 100", () => {
    const s = [
      { ts: NOW - 40 * DAY, v: 90 },
      { ts: NOW - 31 * DAY, v: 120 },
      { ts: NOW - 10 * DAY, v: 132 },
      { ts: NOW, v: 108 },
    ];
    const w = window_(s, NOW - 30 * DAY, NOW);
    expect(w[0]).toEqual({ ts: NOW - 30 * DAY, v: 120 }); // value in force at the start
    expect(rebase(w).map((p) => Number(p.v.toFixed(9)))).toEqual([100, 110, 90]);
    // a series that starts inside the window begins at its first point
    expect(window_([{ ts: NOW - 5 * DAY, v: 50 }], NOW - 30 * DAY, NOW)).toEqual([{ ts: NOW - 5 * DAY, v: 50 }]);
  });

  it("stats: return, max drawdown, annualised volatility of daily closes", () => {
    const st = stats(daily([100, 110, 99, 105]));
    expect(st.ret).toBeCloseTo(0.05, 10);
    expect(st.dd).toBeCloseTo(99 / 110 - 1, 10);
    expect(st.vol).toBeGreaterThan(0);
    expect(stats(daily([100, 100, 100])).vol).toBe(0);
    expect(stats([{ ts: NOW, v: 100 }])).toEqual({ ret: null, vol: null, dd: null });
  });

  it("rebalance status and the attention rule", () => {
    const i = ix("0x01", { mode: 2, version: 3 });
    expect(rebalanceStatus(i, detail({ pending: { assets: [], weightsBps: [], reason: "", at: NOW + 18 * 3600 } }), 0, NOW)).toMatchObject({ text: "Version 4 in 18h", tone: "warn", attention: true });
    expect(rebalanceStatus(i, detail({ due: "Auto" }), 0, NOW)).toMatchObject({ text: "Due now", attention: true });
    expect(rebalanceStatus(i, detail({}), 4000, NOW)).toMatchObject({ text: "Drift 40.0% · trigger ±50%", attention: true }); // ≥ 80% of 50%
    expect(rebalanceStatus(i, detail({}), 3000, NOW)).toMatchObject({ text: "On target", tone: "good", attention: false });
    expect(rebalanceStatus(ix("0x02", { mode: 1 }), detail({ mode: 1 }), null, NOW)).toMatchObject({ text: "No version scheduled", attention: false });
    expect(rebalanceStatus(ix("0x03", { model: "vault", mode: 2 }), null, null, NOW)).toMatchObject({ text: "Auto", attention: false });
  });

  it("benchmark: who beat AVAX over the period, best and worst", () => {
    const a = ix("0x0a", { name: "Up" });
    const b = ix("0x0b", { name: "Down" });
    const v = workspaceVM({
      indexes: [a, b],
      levels: { "0x0a": daily([100, 105, 120]), "0x0b": daily([100, 95, 90]) },
      details: {},
      drift: {},
      avax: daily([10, 10.5, 11]), // +10%
      period: 7,
      hidden: new Set(["0x0b"]),
      now: NOW,
    });
    expect(v.beatN).toBe(1);
    expect(v.count).toBe(2);
    expect(v.best).toMatchObject({ n: "Up", r: "+20.00%" });
    expect(v.worst).toMatchObject({ n: "Down", r: "-10.00%" });
    expect(v.bench.r).toBe("+10.00%");
    expect(v.rows[0]).toMatchObject({ vs: "+10.0 pts", since: "+10.00%", lv: "110.00", href: "/index/0x0a" });
    // the hidden index has no line; AVAX is the dashed one
    expect(v.lines.map((l) => l.key)).toEqual(["0x0a", "avax"]);
    expect(v.lines[1]?.dash).toBe("5 5");
    expect(v.legend.find((l) => l.id === "0x0b")?.on).toBe(false);
    expect(v.ticks.some((t) => t.v === "100" && t.line === "#3A3A40")).toBe(true);
  });
});
