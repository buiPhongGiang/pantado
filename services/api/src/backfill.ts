/**
 * Level history before an index existed, replayed from real daily closes: level(t) = Σ units_i × close_i(t), with
 * the index's units from its creation, scaled so the replay meets the first indexed level. A backtest, not a record:
 * the API returns it apart from the indexed levels and the app labels it.
 */
export interface DailyClose {
  t: number; // day start, unix seconds
  c: number; // USD close
}

export interface BackfillPoint {
  ts: number;
  level: number;
}

/**
 * `units[i]` whole tokens of asset i (float), `closes[i]` its daily closes (any order). Returns one point per day
 * before `beforeTs` on which every asset has a close (carrying a missing close forward), oldest first, the last
 * point scaled to `joinLevel` when given.
 */
export function backfillLevels(units: number[], closes: DailyClose[][], beforeTs: number, joinLevel: number | null, maxDays = 365): BackfillPoint[] {
  if (!units.length || units.length !== closes.length) return [];
  const byAsset = closes.map((cs) => new Map(cs.map((x) => [Math.floor(x.t / 86_400), x.c])));
  const days = [...new Set(closes.flat().map((x) => Math.floor(x.t / 86_400)))].sort((a, b) => a - b);
  const lastDay = Math.floor(beforeTs / 86_400);
  const last: (number | null)[] = units.map(() => null);
  const out: BackfillPoint[] = [];
  for (const day of days) {
    if (day >= lastDay) break;
    byAsset.forEach((m, i) => {
      const c = m.get(day);
      if (c !== undefined && Number.isFinite(c) && c > 0) last[i] = c;
    });
    if (last.some((c) => c === null)) continue;
    const level = units.reduce((s, u, i) => s + u * (last[i] as number), 0);
    // the close of a day is its last price: place the point at the end of that day
    out.push({ ts: day * 86_400 + 86_399, level });
  }
  const tail = out.slice(-maxDays);
  const end = tail[tail.length - 1];
  if (!end || joinLevel === null || !(end.level > 0)) return tail;
  const k = joinLevel / end.level;
  return tail.map((p) => ({ ts: p.ts, level: p.level * k }));
}
