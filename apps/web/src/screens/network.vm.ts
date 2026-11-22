import { ago } from "../lib/fmt";
import { short } from "../lib/nav";
import { logoFill, logoOf } from "../lib/logos";
import type { AssetView, IndexView } from "./asset.api";

/** `/network` (services/api/src/network.ts): the Pantado Price Chain as read from the L1 and the C-Chain. */
export interface NetworkView {
  chain: { name: string; chainId: number; blockchainId: string; head: number; headAt: number; cchainChainId: number; cchainHead: number; icmMessenger: string; priceReports: string; receiver: string };
  threshold: number;
  roundSec: number;
  lastFinalRound: number;
  lastDeliveredRound: number;
  reporters: { address: string; active: boolean; lastRound: number | null; lastAt: number | null; maxDeviationBps: number | null }[];
  rounds: { round: number; reporters: string[]; assets: number; finalizedAt: number | null; l1Block: number | null; deliveredAt: number | null; cchainBlock: number | null; icmDelaySec: number | null }[];
  prices: { id: string; l1Usd: number | null; l1Round: number | null; cchainUsd: number | null; cchainRound: number | null; ts: number | null }[];
}

export type Tone = "good" | "warn" | "bad" | "idle";
export const TONE: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "#11261B", fg: "#3DD68C" },
  warn: { bg: "#2E2311", fg: "#F5B14C" },
  bad: { bg: "#2A1215", fg: "#FF6B6B" },
  idle: { bg: "#1F1F23", fg: "#B4B4BB" },
};

const usd = (x: number | null): string => (x === null ? "—" : x >= 1000 ? `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${x.toFixed(4)}`);
const roundTime = (round: number, roundSec: number): string => new Date(round * roundSec * 1000).toISOString().slice(11, 16) + " UTC";
const hm = (round: number, roundSec: number): string => new Date(round * roundSec * 1000).toISOString().slice(11, 16);

/** One stage of the price flow strip (reference/index-layer Network): reporters → L1 → ICM → C-Chain. */
export interface Stage {
  label: string;
  value: string;
  note: string;
  tone: Tone;
}

export interface NetworkVM {
  stages: Stage[];
  footer: string;
  stats: { label: string; value: string; sub: string; tone: Tone }[];
  chainRows: { k: string; v: string; mono: boolean }[];
  rounds: { round: string; at: string; hm: string; reporters: string[]; assets: string; l1: string; cchain: string; delay: string; status: string; line: string; tone: Tone }[];
  reporters: { address: string; addr: string; status: string; tone: Tone; lastRound: string; lastAt: string; seen: string; gap: string; gapTone: Tone }[];
  prices: { id: string; sym: string; name: string; logo: string | null; img: string | null; color: string; l1: string; cchain: string; px: string; round: string; age: string; note: string; status: string; tone: Tone }[];
  indexes: { name: string; ticker: string; level: string; href: string; vnWeight: string }[];
}

/**
 * Network page view model. Everything comes from the chains: a round is "Delivered" once the C-Chain receiver has
 * it, "Final on L1" when the L1 finalized it but ICM has not delivered it yet, "Collecting" when reporters are still
 * submitting. A price is "In sync" when the C-Chain holds the L1's latest round for that asset.
 */
export function networkVM(n: NetworkView, assets: AssetView[], indexes: IndexView[], nowSec: number): NetworkVM {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const active = n.reporters.filter((r) => r.active).length;
  const headAge = nowSec - n.chain.headAt;
  const delivered = n.rounds.filter((r) => r.icmDelaySec !== null);
  const avgDelay = delivered.length ? delivered.reduce((s, r) => s + (r.icmDelaySec ?? 0), 0) / delivered.length : null;
  const behind = n.lastFinalRound - n.lastDeliveredRound;
  const lastRoundAge = nowSec - (n.lastFinalRound + 1) * n.roundSec;

  const stats: NetworkVM["stats"] = [
    { label: "Last final round", value: n.lastFinalRound ? `#${n.lastFinalRound}` : "—", sub: n.lastFinalRound ? `${roundTime(n.lastFinalRound, n.roundSec)} · every ${n.roundSec}s` : `every ${n.roundSec}s`, tone: lastRoundAge <= 3 * n.roundSec ? "good" : "warn" },
    { label: "Reporters", value: `${active}`, sub: `${n.threshold} of ${active} needed to finalize`, tone: active >= n.threshold ? "good" : "bad" },
    { label: "ICM to C-Chain", value: behind <= 0 ? "In sync" : `${behind} behind`, sub: avgDelay === null ? "no delivery yet" : `average ${avgDelay.toFixed(1)}s after finalization`, tone: behind <= 0 ? "good" : behind <= 2 ? "warn" : "bad" },
    { label: "L1 head", value: `#${n.chain.head.toLocaleString("en-US")}`, sub: `${ago(n.chain.headAt, nowSec)} · chain ${n.chain.chainId}`, tone: headAge <= 3 * n.roundSec ? "good" : "warn" },
  ];

  const chainRows: NetworkVM["chainRows"] = [
    { k: "Chain", v: `${n.chain.name} · Avalanche L1 · chain ID ${n.chain.chainId}`, mono: false },
    { k: "Blockchain ID", v: n.chain.blockchainId, mono: true },
    { k: "PriceReports (L1)", v: n.chain.priceReports, mono: true },
    { k: "Receiver (C-Chain)", v: `${n.chain.receiver} · chain ID ${n.chain.cchainChainId}`, mono: true },
    { k: "ICM messenger", v: n.chain.icmMessenger, mono: true },
    { k: "Rule", v: `Each round, ${n.threshold} of ${active} reporters must report; the median of each price is final on the L1 and sent to the C-Chain over Avalanche ICM.`, mono: false },
  ];

  const rounds: NetworkVM["rounds"] = n.rounds.map((r) => {
    const status: [string, Tone] = r.deliveredAt !== null ? ["Delivered", "good"] : r.finalizedAt !== null ? ["Final on L1", "warn"] : ["Collecting", "idle"];
    return {
      round: `#${r.round.toLocaleString("en-US")}`,
      at: roundTime(r.round, n.roundSec),
      hm: hm(r.round, n.roundSec),
      line: r.icmDelaySec === null ? status[0] : `${status[0]} · ${r.icmDelaySec}s`,
      reporters: r.reporters.map((a) => short(a)),
      assets: r.assets ? String(r.assets) : "—",
      l1: r.l1Block === null ? "—" : `block ${r.l1Block}`,
      cchain: r.cchainBlock === null ? "—" : `block ${r.cchainBlock}`,
      delay: r.icmDelaySec === null ? "—" : `${r.icmDelaySec}s`,
      status: status[0],
      tone: status[1],
    };
  });

  const reporters: NetworkVM["reporters"] = n.reporters.map((r) => {
    const gapTone: Tone = r.maxDeviationBps === null ? "idle" : r.maxDeviationBps <= 50 ? "good" : r.maxDeviationBps <= 200 ? "warn" : "bad";
    const fresh = r.lastAt !== null && nowSec - r.lastAt <= 5 * n.roundSec;
    return {
      address: r.address,
      addr: short(r.address),
      seen: !r.active ? "removed" : r.lastAt === null ? "waiting" : fresh ? ago(r.lastAt, nowSec) : `quiet ${ago(r.lastAt, nowSec).replace(/ ago$/, "")}`,
      status: !r.active ? "Removed" : r.lastAt === null ? "Waiting" : fresh ? "Reporting" : "Quiet",
      tone: !r.active ? "bad" : r.lastAt === null ? "idle" : fresh ? "good" : "warn",
      lastRound: r.lastRound === null ? "—" : `#${r.lastRound}`,
      lastAt: r.lastAt === null ? "—" : ago(r.lastAt, nowSec),
      gap: r.maxDeviationBps === null ? "—" : `${(r.maxDeviationBps / 100).toFixed(2)}%`,
      gapTone,
    };
  });

  const prices: NetworkVM["prices"] = n.prices.map((p) => {
    const a = byId.get(p.id);
    const sync = p.l1Round !== null && p.cchainRound !== null && p.cchainRound >= p.l1Round;
    const status: [string, Tone] = p.l1Round === null ? ["No round yet", "idle"] : sync ? ["In sync", "good"] : p.cchainRound === null ? ["Not delivered", "bad"] : ["Behind", "warn"];
    return {
      id: p.id,
      sym: a?.displaySymbol ?? p.id.toUpperCase(),
      name: a?.name ?? "",
      logo: logoFill(p.id),
      img: logoOf(p.id),
      color: a?.color ?? "#8E8E96",
      l1: usd(p.l1Usd),
      cchain: usd(p.cchainUsd),
      px: usd(p.cchainUsd ?? p.l1Usd),
      note: p.ts === null ? status[0] : status[1] === "good" ? ago(p.ts, nowSec) : `${status[0]} · ${ago(p.ts, nowSec)}`,
      round: p.cchainRound === null ? "—" : `#${p.cchainRound}`,
      age: p.ts === null ? "—" : ago(p.ts, nowSec),
      status: status[0],
      tone: status[1],
    };
  });

  // indexes whose value uses these prices: any public index holding a priced asset
  const execToId = new Map(assets.filter((a) => a.execution.address).map((a) => [(a.execution.address as string).toLowerCase(), a.id]));
  const priced = new Set(n.prices.map((p) => p.id));
  const out: NetworkVM["indexes"] = [];
  for (const ix of indexes) {
    let bps = 0;
    ix.assets.forEach((addr, i) => {
      const id = execToId.get(addr.toLowerCase());
      if (id && priced.has(id)) bps += ix.targetBps[i] ?? 0;
    });
    if (bps > 0) out.push({ name: ix.name, ticker: ix.ticker, level: (Number(ix.level) / 1e18).toFixed(2), href: `/index/${ix.id}`, vnWeight: `${Math.round(bps / 100)}%` });
  }
  out.sort((x, y) => Number(y.vnWeight.slice(0, -1)) - Number(x.vnWeight.slice(0, -1)));

  const reporting = reporters.filter((r) => r.status === "Reporting").length;
  const withRound = prices.filter((p) => p.status !== "No round yet");
  const synced = withRound.filter((p) => p.status === "In sync").length;
  const lag = withRound.length - synced;
  const stages: Stage[] = [
    { label: "Reporters", value: `${reporting} / ${active}`, note: `reporting · ${n.threshold} needed`, tone: reporting >= n.threshold ? "good" : "warn" },
    { label: "Final on L1", value: n.lastFinalRound ? `#${n.lastFinalRound.toLocaleString("en-US")}` : "—", note: n.lastFinalRound ? roundTime(n.lastFinalRound, n.roundSec) : "no round yet", tone: stats[0]?.tone ?? "idle" },
    { label: "ICM delivery", value: avgDelay === null ? "—" : `${avgDelay.toFixed(1)}s`, note: avgDelay === null ? "no delivery yet" : behind > 0 ? `average · ${behind} round${behind === 1 ? "" : "s"} behind` : "average", tone: behind <= 0 ? "good" : behind <= 2 ? "warn" : "bad" },
    { label: "On C-Chain", value: `${synced} / ${withRound.length}`, note: lag === 0 ? "all in sync" : `${lag} price${lag === 1 ? "" : "s"} behind`, tone: lag === 0 ? "good" : "warn" },
  ];
  const footer = `${n.threshold} of ${active} reporters · median per asset · ${n.roundSec}s rounds · delivered to the C-Chain over Avalanche ICM`;

  return { stages, footer, stats, chainRows, rounds, reporters, prices, indexes: out };
}
