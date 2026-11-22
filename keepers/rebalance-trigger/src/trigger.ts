import { Counter, Gauge, type Registry } from "prom-client";
import { encodeFunctionData, type Account, type Address } from "viem";
import { indexRegistryAbi, rebalancerAbi, tx } from "@pantado/sdk";
import { listIndexes, simulateAndSend, type ChainContext, type Logger } from "@pantado/service-kit";
import { nextAction, Status, type Action, type IndexView, type TriggerParams } from "./logic.js";

export class RebalanceTrigger {
  lastOkAt = 0;
  private params: TriggerParams | null = null;
  private readonly m;

  constructor(
    private readonly ctx: ChainContext,
    private readonly account: Account,
    private readonly log: Logger,
    registry: Registry,
  ) {
    const r = [registry];
    this.m = {
      actions: new Counter({ name: "trigger_actions_total", help: "rebalance actions sent", labelNames: ["action", "result"], registers: r }),
      active: new Gauge({ name: "trigger_active_plans", help: "plans scheduled or active", registers: r }),
      balance: new Gauge({ name: "keeper_balance_avax", help: "keeper native balance", labelNames: ["keeper"], registers: r }),
    };
  }

  async view(index: Address): Promise<IndexView> {
    const r = this.ctx.reader;
    const ps = await r.planState(index);
    let due = false;
    if (ps.mode === 2 && ps.plan.status !== Status.Scheduled && ps.plan.status !== Status.Active) {
      try {
        [due] = await r.isDue(index);
      } catch {
        due = false; // stale prices: not due until they are fresh again
      }
    }
    return {
      mode: ps.mode,
      planStatus: ps.plan.status,
      planStartAt: Number(ps.plan.startAt),
      planStartedAt: Number(ps.plan.startedAt),
      valueAtStart: ps.plan.valueAtStart,
      auctionLive: ps.auctionLive,
      tradedLast24h: ps.tradedLast24h,
      due,
    };
  }

  /**
   * Data indexes (IndexRegistry, B101): the contract decides what is due (drop an unusable asset, apply a scheduled
   * basket, an Auto rebalance); the keeper only pokes. Anyone may poke, so this keeper is a convenience, not a trust.
   */
  async pokeDataIndexes(): Promise<PokeResult[]> {
    const { ctx, account, log } = this;
    const reg = ctx.deployment.contracts.indexRegistry;
    if (!reg) return [];
    const n = await ctx.publicClient.readContract({ address: reg, abi: indexRegistryAbi, functionName: "indexCount" });
    const ids = await ctx.publicClient.readContract({ address: reg, abi: indexRegistryAbi, functionName: "indexes", args: [0n, n] });
    const out: PokeResult[] = [];
    for (const index of ids) {
      const d = await ctx.publicClient.readContract({ address: reg, abi: indexRegistryAbi, functionName: "due", args: [index] });
      if (d === 0) continue;
      const action = `poke:${DUE[d] ?? "auto"}` as PokeResult["action"];
      const res = await simulateAndSend(ctx, account, tx.pokeIndex(reg, index));
      this.m.actions.inc({ action, result: res.ok ? "ok" : res.error.code });
      if (res.ok) log.info(action, { index, tx: res.hash });
      else log.warn(`${action} skipped`, { index, code: res.error.code, error: res.error.message });
      out.push(res.ok ? { index, action, ok: true } : { index, action, ok: false, error: res.error.code });
    }
    return out;
  }

  async tick(): Promise<PokeResult[]> {
    const { ctx, account, log } = this;
    if (!this.params) {
      const p = await ctx.reader.rebalancerParams();
      this.params = { maxDurationSec: Number(p.maxDurationSec), dailyCapBps: p.dailyCapBps };
    }
    const now = Number((await ctx.publicClient.getBlock()).timestamp);
    const rb = ctx.deployment.contracts.rebalancer;
    const results: PokeResult[] = [];
    let active = 0;
    for (const index of await listIndexes(ctx)) {
      const v = await this.view(index);
      if (v.planStatus === Status.Scheduled || v.planStatus === Status.Active) active += 1;
      const action = nextAction(v, now, this.params);
      if (!action) continue;
      const req =
        action === "trigger" ? tx.trigger(rb, index)
        : action === "startPlan" ? tx.startPlan(rb, index)
        : action === "openAuction" ? tx.openAuction(rb, index)
        : action === "finalize" ? tx.finalize(rb, index)
        : { to: rb, data: syncData(index) };
      const res = await simulateAndSend(ctx, account, req);
      this.m.actions.inc({ action, result: res.ok ? "ok" : res.error.code });
      if (res.ok) log.info(action, { index, tx: res.hash });
      else log.warn(`${action} skipped`, { index, code: res.error.code, error: res.error.message });
      results.push(res.ok ? { index, action, ok: true } : { index, action, ok: false, error: res.error.code });
    }
    results.push(...(await this.pokeDataIndexes()));
    this.m.active.set(active);
    this.m.balance.set({ keeper: "rebalance-trigger" }, Number(await ctx.publicClient.getBalance({ address: account.address })) / 1e18);
    this.lastOkAt = Date.now();
    return results;
  }
}

const DUE = ["none", "drop", "pending", "auto"] as const;

export interface PokeResult {
  index: Address;
  action: Action | "poke:drop" | "poke:pending" | "poke:auto";
  ok: boolean;
  error?: string;
}

function syncData(index: Address): `0x${string}` {
  return encodeFunctionData({ abi: rebalancerAbi, functionName: "sync", args: [index] });
}
