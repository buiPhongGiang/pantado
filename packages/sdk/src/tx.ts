import { encodeFunctionData, erc20Abi, maxUint256, type Address, type Hex } from "viem";
import { indexFactoryAbi, indexRegistryAbi, indexVaultAbi, feeSplitterAbi, rebalancerAbi, swapRouterAbi, priceOracleAbi } from "./abis/index.js";

/** An unsigned call for a wallet to send. The agent never signs these (spec §10.2). */
export interface TxRequest {
  to: Address;
  data: Hex;
  value?: bigint;
}

export const RebalanceMode = { Off: 0, Manual: 1, Auto: 2 } as const;
export type RebalanceModeValue = (typeof RebalanceMode)[keyof typeof RebalanceMode];

export interface CreateIndexInput {
  name: string;
  ticker: string;
  description: string;
  assets: Address[];
  weightsBps: number[];
  mode: RebalanceModeValue;
  driftBps: number; // Auto θ in bps, 0 = default
  isPublic: boolean;
  usdcIn: bigint;
  minUnits: bigint;
}

/** An index defined on the IndexRegistry: no deposit, no basket held; the level follows published prices. */
export interface DefineIndexInput {
  name: string;
  ticker: string;
  description: string;
  assets: Address[];
  weightsBps: number[];
  isPublic: boolean;
  /** RebalanceMode: Off, Manual (creator publishes new baskets) or Auto (anyone pokes on interval / drift) */
  mode: RebalanceModeValue;
  /** Auto only (else 0): relative drift that triggers a rebalance, bps */
  driftBps: number;
  /** Auto only (else 0): rebalance at least this often, seconds */
  intervalSec: bigint;
}

export const tx = {
  defineIndex(registry: Address, p: DefineIndexInput): TxRequest {
    return {
      to: registry,
      data: encodeFunctionData({
        abi: indexRegistryAbi,
        functionName: "create",
        args: [
          {
            name: p.name,
            ticker: p.ticker,
            description: p.description,
            assets: p.assets,
            weightsBps: p.weightsBps,
            isPublic: p.isPublic,
            mode: p.mode,
            driftBps: p.driftBps,
            intervalSec: p.intervalSec,
          },
        ],
      }),
    };
  },

  /** New basket for a data index; `noticeSec` 0 applies it now, otherwise it is scheduled. */
  rebalanceIndex(registry: Address, index: Address, assets: Address[], weightsBps: number[], reason: string, noticeSec = 0n): TxRequest {
    return { to: registry, data: encodeFunctionData({ abi: indexRegistryAbi, functionName: "rebalance", args: [index, assets, weightsBps, reason, noticeSec] }) };
  },

  cancelIndexRebalance(registry: Address, index: Address): TxRequest {
    return { to: registry, data: encodeFunctionData({ abi: indexRegistryAbi, functionName: "cancelRebalance", args: [index] }) };
  },

  setIndexMode(registry: Address, index: Address, mode: RebalanceModeValue, driftBps: number, intervalSec: bigint): TxRequest {
    return { to: registry, data: encodeFunctionData({ abi: indexRegistryAbi, functionName: "setMode", args: [index, mode, driftBps, intervalSec] }) };
  },

  /** Anyone: apply what is due (drop unusable assets, a scheduled rebalance, an Auto rebalance). */
  pokeIndex(registry: Address, index: Address): TxRequest {
    return { to: registry, data: encodeFunctionData({ abi: indexRegistryAbi, functionName: "poke", args: [index] }) };
  },

  makeIndexPublic(registry: Address, index: Address): TxRequest {
    return { to: registry, data: encodeFunctionData({ abi: indexRegistryAbi, functionName: "makePublic", args: [index] }) };
  },

  approve(token: Address, spender: Address, amount: bigint = maxUint256): TxRequest {
    return { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) };
  },

  createAndBuy(factory: Address, p: CreateIndexInput): TxRequest {
    return {
      to: factory,
      data: encodeFunctionData({
        abi: indexFactoryAbi,
        functionName: "createAndBuy",
        args: [
          {
            name: p.name,
            ticker: p.ticker,
            description: p.description,
            assets: p.assets,
            weightsBps: p.weightsBps,
            mode: p.mode,
            driftBps: p.driftBps,
            isPublic: p.isPublic,
            usdcIn: p.usdcIn,
            minUnits: p.minUnits,
          },
        ],
      }),
    };
  },

  makePublic(factory: Address, index: Address): TxRequest {
    return { to: factory, data: encodeFunctionData({ abi: indexFactoryAbi, functionName: "makePublic", args: [index] }) };
  },

  buy(index: Address, usdcIn: bigint, minUnits: bigint, to: Address): TxRequest {
    return { to: index, data: encodeFunctionData({ abi: indexVaultAbi, functionName: "buy", args: [usdcIn, minUnits, to] }) };
  },

  sell(index: Address, units: bigint, minOut: bigint, to: Address): TxRequest {
    return { to: index, data: encodeFunctionData({ abi: indexVaultAbi, functionName: "sell", args: [units, minOut, to] }) };
  },

  redeem(index: Address, units: bigint, to: Address, forfeit: Address[] = []): TxRequest {
    return {
      to: index,
      data: encodeFunctionData({ abi: indexVaultAbi, functionName: "redeem", args: [units, to, forfeit] }),
    };
  },

  swap(router: Address, tokenIn: Address, tokenOut: Address, amountIn: bigint, minOut: bigint, to: Address): TxRequest {
    return {
      to: router,
      data: encodeFunctionData({ abi: swapRouterAbi, functionName: "swap", args: [tokenIn, tokenOut, amountIn, minOut, to] }),
    };
  },

  claim(feeSplitter: Address, to: Address): TxRequest {
    return { to: feeSplitter, data: encodeFunctionData({ abi: feeSplitterAbi, functionName: "claim", args: [to] }) };
  },

  publishVersion(rebalancer: Address, index: Address, weightsBps: number[], reason: string): TxRequest {
    return {
      to: rebalancer,
      data: encodeFunctionData({ abi: rebalancerAbi, functionName: "publishVersion", args: [index, weightsBps, reason] }),
    };
  },

  requestMode(rebalancer: Address, index: Address, mode: RebalanceModeValue, driftBps: number): TxRequest {
    return {
      to: rebalancer,
      data: encodeFunctionData({ abi: rebalancerAbi, functionName: "requestMode", args: [index, mode, driftBps] }),
    };
  },

  trigger(rebalancer: Address, index: Address): TxRequest {
    return { to: rebalancer, data: encodeFunctionData({ abi: rebalancerAbi, functionName: "trigger", args: [index] }) };
  },

  startPlan(rebalancer: Address, index: Address): TxRequest {
    return { to: rebalancer, data: encodeFunctionData({ abi: rebalancerAbi, functionName: "startPlan", args: [index] }) };
  },

  openAuction(rebalancer: Address, index: Address): TxRequest {
    return { to: rebalancer, data: encodeFunctionData({ abi: rebalancerAbi, functionName: "openAuction", args: [index] }) };
  },

  fill(rebalancer: Address, index: Address, amountOut: bigint, maxPay: bigint): TxRequest {
    return {
      to: rebalancer,
      data: encodeFunctionData({ abi: rebalancerAbi, functionName: "fill", args: [index, amountOut, maxPay] }),
    };
  },

  finalize(rebalancer: Address, index: Address): TxRequest {
    return { to: rebalancer, data: encodeFunctionData({ abi: rebalancerAbi, functionName: "finalize", args: [index] }) };
  },

  pushPrices(oracle: Address, assets: Address[], pricesE18: bigint[]): TxRequest {
    return {
      to: oracle,
      data: encodeFunctionData({ abi: priceOracleAbi, functionName: "pushMany", args: [assets, pricesE18] }),
    };
  },
};
