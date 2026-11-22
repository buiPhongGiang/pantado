import { stringToHex, type Hex } from "viem";
import type { VnQuote } from "@pantado/shared";

/** Asset id on the price chain: the registry id as a right-padded bytes32 string ("fpt" → 0x667074…00). */
export const assetKey = (id: string): Hex => stringToHex(id, { size: 32 });

/** USD per whole asset as 1e18 fixed point (12 significant decimals kept, then scaled). */
export function toE18(usd: number): bigint {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error(`bad price ${usd}`);
  return BigInt(Math.round(usd * 1e12)) * 1_000_000n;
}

/** One reporter's submission for a round: every asset it has a quote for, in a stable order. */
export function buildReport(assets: { id: string; symbol: string }[], quote: (symbol: string) => VnQuote | null): { ids: Hex[]; prices: bigint[]; ts: bigint[] } {
  const ids: Hex[] = [];
  const prices: bigint[] = [];
  const ts: bigint[] = [];
  for (const a of [...assets].sort((x, y) => x.id.localeCompare(y.id))) {
    const q = quote(a.symbol);
    if (!q || !(q.usd > 0)) continue;
    ids.push(assetKey(a.id));
    prices.push(toE18(q.usd));
    ts.push(BigInt(q.ts));
  }
  return { ids, prices, ts };
}
