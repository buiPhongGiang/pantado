import { describe, expect, it } from "vitest";
import { buildRounds, deviationBps } from "../src/network.js";

describe("price chain network view", () => {
  it("measures a report's gap from the median in bps", () => {
    expect(deviationBps(101n, 100n)).toBe(100);
    expect(deviationBps(99n, 100n)).toBe(100);
    expect(deviationBps(1_757_812_500_000_000_000n, 1_757_812_500_000_000_000n)).toBe(0);
    expect(deviationBps(5n, 0n)).toBe(0);
  });

  it("joins L1 submissions and finalizations with C-Chain receipts into rounds, newest first", () => {
    const r = buildRounds(
      [
        { round: 7, reporter: "0xB", block: 11 },
        { round: 7, reporter: "0xA", block: 10 },
        { round: 8, reporter: "0xA", block: 12 },
      ],
      [{ round: 7, assets: 25, block: 11, at: 1000 }],
      [
        { round: 7, block: 5, at: 1003 },
        { round: 7, block: 6, at: 1009 },
      ],
      10,
    );
    expect(r.map((x) => x.round)).toEqual([8, 7]);
    expect(r[1]).toMatchObject({ reporters: ["0xA", "0xB"], assets: 25, l1Block: 11, cchainBlock: 5, deliveredAt: 1003, icmDelaySec: 3 });
    expect(r[0]).toMatchObject({ reporters: ["0xA"], finalizedAt: null, deliveredAt: null, icmDelaySec: null });
    expect(buildRounds([], [], [], 10)).toEqual([]);
  });
});
