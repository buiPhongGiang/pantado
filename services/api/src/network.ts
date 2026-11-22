import { createPublicClient, http, parseAbiItem, stringToHex, type Address, type Hex, type PublicClient } from "viem";

/**
 * Pantado Price Chain view for the Network page: what each reporter submitted, the median finalized on the L1 per
 * round, and when the C-Chain receiver got it over ICM. Read straight from both chains (events + views).
 */

const submitted = parseAbiItem("event Submitted(uint64 indexed round, address indexed reporter, uint256 assets)");
const finalizedEv = parseAbiItem("event Finalized(uint64 indexed round, uint256 assets, bytes32 messageId)");
const received = parseAbiItem("event PriceReceived(bytes32 indexed id, uint64 indexed round, uint256 priceE18, uint64 ts)");

const reportsAbi = [
  { type: "function", name: "threshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "roundSec", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "reporters", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "isReporter", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "lastFinalRound", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  {
    type: "function",
    name: "reportOf",
    stateMutability: "view",
    inputs: [{ type: "uint64" }, { type: "address" }],
    outputs: [{ type: "bytes32[]" }, { type: "uint256[]" }, { type: "uint64[]" }],
  },
  {
    type: "function",
    name: "latest",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }, { type: "uint64" }, { type: "uint64" }],
  },
] as const;

const receiverAbi = [
  { type: "function", name: "lastRound", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  {
    type: "function",
    name: "priceOf",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }, { type: "uint64" }, { type: "uint64" }],
  },
] as const;

export interface PriceChainSource {
  name: string;
  l1ChainId: number;
  l1BlockchainId: Hex;
  l1Rpc: string;
  cchainChainId: number;
  cchainRpc: string;
  priceReports: Address;
  receiver: Address;
  icmMessenger: Address;
}

export interface NetworkRound {
  round: number;
  /** reporters in submission order (the first `threshold` decided the median) */
  reporters: Address[];
  assets: number;
  finalizedAt: number | null;
  l1Block: number | null;
  deliveredAt: number | null;
  cchainBlock: number | null;
  /** seconds from finalization on the L1 to receipt on the C-Chain */
  icmDelaySec: number | null;
}

export interface NetworkReporter {
  address: Address;
  active: boolean;
  lastRound: number | null;
  lastAt: number | null;
  /** largest gap of this reporter's prices from the finalized median in its last round, in bps */
  maxDeviationBps: number | null;
}

export interface NetworkPrice {
  id: string;
  l1Usd: number | null;
  l1Round: number | null;
  cchainUsd: number | null;
  cchainRound: number | null;
  ts: number | null;
}

export interface NetworkView {
  chain: { name: string; chainId: number; blockchainId: Hex; head: number; headAt: number; cchainChainId: number; cchainHead: number; icmMessenger: Address; priceReports: Address; receiver: Address };
  threshold: number;
  roundSec: number;
  lastFinalRound: number;
  lastDeliveredRound: number;
  reporters: NetworkReporter[];
  rounds: NetworkRound[];
  prices: NetworkPrice[];
}

/** Gap of `x` from `median` in bps (absolute). */
export function deviationBps(x: bigint, median: bigint): number {
  if (median === 0n) return 0;
  const d = x > median ? x - median : median - x;
  return Number((d * 10_000_000n) / median) / 1000;
}

/** Rounds from L1 Submitted / Finalized logs and C-Chain PriceReceived logs, newest first. */
export function buildRounds(
  subs: { round: number; reporter: Address; block: number }[],
  fins: { round: number; assets: number; block: number; at: number }[],
  recv: { round: number; block: number; at: number }[],
  limit: number,
): NetworkRound[] {
  const byRound = new Map<number, NetworkRound>();
  const get = (r: number): NetworkRound => {
    let x = byRound.get(r);
    if (!x) {
      x = { round: r, reporters: [], assets: 0, finalizedAt: null, l1Block: null, deliveredAt: null, cchainBlock: null, icmDelaySec: null };
      byRound.set(r, x);
    }
    return x;
  };
  for (const s of [...subs].sort((a, b) => a.block - b.block)) get(s.round).reporters.push(s.reporter);
  for (const f of fins) Object.assign(get(f.round), { assets: f.assets, finalizedAt: f.at, l1Block: f.block });
  for (const r of recv) {
    const x = get(r.round);
    if (x.deliveredAt === null || r.at < x.deliveredAt) Object.assign(x, { deliveredAt: r.at, cchainBlock: r.block });
  }
  for (const x of byRound.values()) if (x.finalizedAt !== null && x.deliveredAt !== null) x.icmDelaySec = Math.max(0, x.deliveredAt - x.finalizedAt);
  return [...byRound.values()].sort((a, b) => b.round - a.round).slice(0, limit);
}

export class PriceChainNetwork {
  private readonly l1: PublicClient;
  private readonly c: PublicClient;
  constructor(
    readonly src: PriceChainSource,
    private readonly ids: string[],
  ) {
    this.l1 = createPublicClient({ transport: http(src.l1Rpc, { batch: { batchSize: 50, wait: 5 } }) }) as PublicClient;
    this.c = createPublicClient({ transport: http(src.cchainRpc, { batch: { batchSize: 50, wait: 5 } }) }) as PublicClient;
  }

  private async blockTimes(client: PublicClient, blocks: number[]): Promise<Map<number, number>> {
    const uniq = [...new Set(blocks)];
    const rows = await Promise.all(uniq.map(async (b) => [b, Number((await client.getBlock({ blockNumber: BigInt(b) })).timestamp)] as const));
    return new Map(rows);
  }

  async view(limit = 20): Promise<NetworkView> {
    const s = this.src;
    const [l1Head, cHead] = await Promise.all([this.l1.getBlock(), this.c.getBlockNumber()]);
    const span = 5_000n;
    const l1From = l1Head.number > span ? l1Head.number - span : 0n;
    const cFrom = cHead > span ? cHead - span : 0n;
    const [threshold, roundSec, lastFinal, lastDelivered, subLogs, finLogs, recvLogs] = await Promise.all([
      this.l1.readContract({ address: s.priceReports, abi: reportsAbi, functionName: "threshold" }),
      this.l1.readContract({ address: s.priceReports, abi: reportsAbi, functionName: "roundSec" }),
      this.l1.readContract({ address: s.priceReports, abi: reportsAbi, functionName: "lastFinalRound" }),
      this.c.readContract({ address: s.receiver, abi: receiverAbi, functionName: "lastRound" }),
      this.l1.getLogs({ address: s.priceReports, event: submitted, fromBlock: l1From, toBlock: l1Head.number }),
      this.l1.getLogs({ address: s.priceReports, event: finalizedEv, fromBlock: l1From, toBlock: l1Head.number }),
      this.c.getLogs({ address: s.receiver, event: received, fromBlock: cFrom, toBlock: cHead }),
    ]);
    // one receipt per round on the C-Chain is enough for its delivery time
    const recvByRound = new Map<number, number>();
    for (const l of recvLogs) {
      const r = Number(l.args.round ?? 0n);
      const b = Number(l.blockNumber ?? 0n);
      if (!recvByRound.has(r) || b < (recvByRound.get(r) ?? b)) recvByRound.set(r, b);
    }
    const finRecent = finLogs.slice(-limit);
    const recvRecent = [...recvByRound.entries()].sort((a, b) => b[0] - a[0]).slice(0, limit);
    const [l1Times, cTimes] = await Promise.all([
      this.blockTimes(this.l1, finRecent.map((l) => Number(l.blockNumber ?? 0n))),
      this.blockTimes(this.c, recvRecent.map(([, b]) => b)),
    ]);
    const rounds = buildRounds(
      subLogs.map((l) => ({ round: Number(l.args.round ?? 0n), reporter: l.args.reporter as Address, block: Number(l.blockNumber ?? 0n) })),
      finRecent.map((l) => ({ round: Number(l.args.round ?? 0n), assets: Number(l.args.assets ?? 0n), block: Number(l.blockNumber ?? 0n), at: l1Times.get(Number(l.blockNumber ?? 0n)) ?? 0 })),
      recvRecent.map(([round, b]) => ({ round, block: b, at: cTimes.get(b) ?? 0 })),
      limit,
    );

    // reporters: every address ever registered (the array only grows), with its last report and gap from the median
    const reporters: NetworkReporter[] = [];
    for (let i = 0; i < 50; i++) {
      let a: Address;
      try {
        a = await this.l1.readContract({ address: s.priceReports, abi: reportsAbi, functionName: "reporters", args: [BigInt(i)] });
      } catch {
        break;
      }
      const active = await this.l1.readContract({ address: s.priceReports, abi: reportsAbi, functionName: "isReporter", args: [a] });
      const mine = subLogs.filter((l) => (l.args.reporter as string).toLowerCase() === a.toLowerCase());
      const last = mine[mine.length - 1];
      let lastAt: number | null = null;
      let maxDeviationBps: number | null = null;
      if (last) {
        const round = last.args.round ?? 0n;
        lastAt = Number((await this.l1.getBlock({ blockNumber: last.blockNumber ?? 0n })).timestamp);
        const [ids, prices] = await this.l1.readContract({ address: s.priceReports, abi: reportsAbi, functionName: "reportOf", args: [round, a] });
        let worst = 0;
        await Promise.all(
          ids.map(async (id, j) => {
            const [med, , r] = await this.l1.readContract({ address: s.priceReports, abi: reportsAbi, functionName: "latest", args: [id] });
            if (r === round && med > 0n) worst = Math.max(worst, deviationBps(prices[j] ?? 0n, med));
          }),
        );
        maxDeviationBps = worst;
      }
      reporters.push({ address: a, active, lastRound: last ? Number(last.args.round ?? 0n) : null, lastAt, maxDeviationBps });
    }

    const prices: NetworkPrice[] = await Promise.all(
      this.ids.map(async (id) => {
        const k = stringToHex(id, { size: 32 });
        const [[l1p, l1ts, l1r], [cp, cts, cr]] = await Promise.all([
          this.l1.readContract({ address: s.priceReports, abi: reportsAbi, functionName: "latest", args: [k] }),
          this.c.readContract({ address: s.receiver, abi: receiverAbi, functionName: "priceOf", args: [k] }),
        ]);
        return {
          id,
          l1Usd: l1p > 0n ? Number(l1p) / 1e18 : null,
          l1Round: l1p > 0n ? Number(l1r) : null,
          cchainUsd: cp > 0n ? Number(cp) / 1e18 : null,
          cchainRound: cp > 0n ? Number(cr) : null,
          ts: cp > 0n ? Number(cts) : l1p > 0n ? Number(l1ts) : null,
        };
      }),
    );

    return {
      chain: {
        name: s.name,
        chainId: s.l1ChainId,
        blockchainId: s.l1BlockchainId,
        head: Number(l1Head.number),
        headAt: Number(l1Head.timestamp),
        cchainChainId: s.cchainChainId,
        cchainHead: Number(cHead),
        icmMessenger: s.icmMessenger,
        priceReports: s.priceReports,
        receiver: s.receiver,
      },
      threshold: Number(threshold),
      roundSec: Number(roundSec),
      lastFinalRound: Number(lastFinal),
      lastDeliveredRound: Number(lastDelivered),
      reporters,
      rounds,
      prices,
    };
  }
}
