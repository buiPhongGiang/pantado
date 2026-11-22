import { createPublicClient, http, stringToHex, type Address, type PublicClient } from "viem";
import type { EnginePrice } from "../engine/tokens.js";

const receiverAbi = [
  {
    type: "function",
    name: "priceOf",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }, { type: "uint64" }, { type: "uint64" }],
  },
] as const;

/**
 * Prices finalized on the Pantado Price Chain (an Avalanche L1 of independent reporters) and delivered to the C-Chain
 * receiver through ICM. The canonical source for Vietnamese stocks when the price chain is configured.
 */
export class PriceChainReader {
  private readonly client: PublicClient;
  constructor(
    rpc: string,
    private readonly receiver: Address,
  ) {
    this.client = createPublicClient({ transport: http(rpc, { batch: { batchSize: 50, wait: 5 } }) }) as PublicClient;
  }

  /** Newest finalized price per asset id (assets never finalized are left out). */
  async prices(ids: string[]): Promise<Map<string, EnginePrice>> {
    const out = new Map<string, EnginePrice>();
    const rows = await Promise.all(
      ids.map(async (id) => [id, await this.client.readContract({ address: this.receiver, abi: receiverAbi, functionName: "priceOf", args: [stringToHex(id, { size: 32 })] })] as const),
    );
    for (const [id, [priceE18, ts, round]] of rows) {
      if (priceE18 === 0n) continue;
      out.set(id, { usd: Number(priceE18) / 1e18, ts: Number(ts), source: `pricechain:${this.receiver}#${round}` });
    }
    return out;
  }
}
