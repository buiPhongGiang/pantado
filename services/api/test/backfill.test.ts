import { describe, expect, it } from "vitest";
import { backfillLevels } from "../src/backfill.js";

const D = 86_400;
const day = (n: number, c: number) => ({ t: n * D, c });

describe("backfillLevels", () => {
  it("replays units × daily closes before launch, joined to the first indexed level", () => {
    // 1 unit of A (closes 10 → 12), 2 units of B (closes 5 → 4); launch on day 3
    const pts = backfillLevels([1, 2], [[day(0, 10), day(1, 11), day(2, 12), day(3, 50)], [day(0, 5), day(1, 4.5), day(2, 4)]], 3 * D + 100, 100);
    expect(pts.map((p) => p.ts)).toEqual([D - 1, 2 * D - 1, 3 * D - 1]);
    // raw 20, 20, 20 → scaled so the last point is 100
    expect(pts.map((p) => Math.round(p.level))).toEqual([100, 100, 100]);
    const raw = backfillLevels([1, 2], [[day(0, 10), day(1, 12)], [day(0, 5), day(1, 5)]], 5 * D, null);
    expect(raw.map((p) => p.level)).toEqual([20, 22]);
  });

  it("waits for every asset, carries a missing close forward and stops before launch", () => {
    const pts = backfillLevels([1, 1], [[day(0, 1), day(1, 2), day(2, 3)], [day(1, 10)]], 2 * D, null);
    expect(pts.map((p) => p.level)).toEqual([12]); // day 0 has no B yet, day 2 is launch day
    expect(backfillLevels([1], [[day(0, 1)], [day(0, 1)]], 5 * D, null)).toEqual([]); // mismatched inputs
  });
});
