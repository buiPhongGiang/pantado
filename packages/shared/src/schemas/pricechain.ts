import { z } from "zod";
import { addressSchema } from "./common.js";

/** `config/pricechain.json`: the Pantado Price Chain (an Avalanche L1 of independent price reporters). */
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const networkSchema = z.strictObject({
  l1: z.strictObject({ name: z.string().min(1), chainId: z.number().int().positive(), rpcEnv: z.string().min(1), blockchainIdHex: hex32 }),
  cchain: z.strictObject({ chainId: z.number().int().positive(), rpc: z.string().url(), blockchainIdHex: hex32 }),
  icmMessenger: addressSchema,
});
export const priceChainFileSchema = z.strictObject({
  $comment: z.string().optional(),
  version: z.literal(1),
  networks: z.record(z.string(), networkSchema),
  roundSec: z.number().int().min(10),
  threshold: z.number().int().min(1),
  reporters: z.number().int().min(1),
  destinationGasLimit: z.number().int().min(100_000),
  reportEverySec: z.number().int().min(5),
});
export type PriceChainFile = z.infer<typeof priceChainFileSchema>;

/** `contracts/deployments/pricechain-<network>.json`, written by scripts/pricechain-deploy-local.sh. */
export const priceChainDeploymentSchema = z.strictObject({
  network: z.string().min(1),
  l1: z.strictObject({ chainId: z.number().int(), priceReports: addressSchema }),
  cchain: z.strictObject({ chainId: z.number().int(), receiver: addressSchema }),
  owner: addressSchema,
  threshold: z.number().int(),
  reporters: z.number().int(),
});
export type PriceChainDeployment = z.infer<typeof priceChainDeploymentSchema>;
