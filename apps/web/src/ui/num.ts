/** Number formatting shared by the screens (no React). */
/** A change rounded to `dp` decimals in percent; float noise around 0 (e.g. −3e−16) is 0, never "−0.00%". */
export function roundPct(v: number, dp: number): number {
  const r = Number((v * 100).toFixed(dp));
  return r === 0 ? 0 : r;
}
export const up = (v: number | null | undefined, dp = 2): string => (v === null || v === undefined || !Number.isFinite(v) ? "#8E8E96" : roundPct(v, dp) >= 0 ? "#3DD68C" : "#FF6B6B");
export const pctS = (v: number | null | undefined, dp = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const r = roundPct(v, dp);
  return `${r >= 0 ? "+" : ""}${r.toFixed(dp)}%`;
};
