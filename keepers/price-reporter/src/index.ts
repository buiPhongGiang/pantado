import { createPublicClient, createWalletClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Counter, Gauge, Registry } from "prom-client";
import { createLogger, envInt, onShutdown, requireEnv, runLoop, startHealthServer } from "@pantado/service-kit";
import { loadAssets, loadPriceChain, loadVnMarket, VnMarket } from "@pantado/shared";
import { priceReportsAbi } from "./abi.js";
import { buildReport } from "./report.js";

/**
 * Price reporter for the Pantado Price Chain (an Avalanche L1). Reads Vietnamese stock prices (HOSE matched trades,
 * VND → USD), and each round submits them to PriceReports on the L1 with its own key. The L1 finalizes the median
 * once `threshold` reporters agree and sends it to the C-Chain through ICM. A partner runs this with one key and its
 * own data source; the local phase runs every reporter key in one process (PRICECHAIN_REPORTER_KEYS, comma separated).
 */
/** Gas for one report: 25 assets stored, plus the median and the ICM message for the finalizing one. */
const REPORT_GAS = 6_000_000n;

async function main(): Promise<void> {
  const log = createLogger("price-reporter");
  const network = process.env.PRICECHAIN_NETWORK ?? "local";
  const { cfg, deployment } = loadPriceChain(network);
  if (!deployment) throw new Error(`price chain not deployed on ${network}: run scripts/pricechain-deploy-local.sh`);
  const net = cfg.networks[network];
  if (!net) throw new Error(`no price chain network "${network}" in config/pricechain.json`);
  const rpc = requireEnv(net.l1.rpcEnv);
  const vnCfg = loadVnMarket();
  if (!vnCfg) throw new Error("config/vn-market.json is missing");
  const assets = loadAssets()
    .filter((a) => a.kind === "stock" && a.display.chain === "hose")
    .map((a) => ({ id: a.id, symbol: a.symbol }));
  const keys = requireEnv("PRICECHAIN_REPORTER_KEYS").split(",").map((k) => k.trim()).filter(Boolean) as Hex[];

  const chain = defineChain({ id: net.l1.chainId, name: net.l1.name, nativeCurrency: { name: "PPC", symbol: "PPC", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const accounts = keys.map((k) => privateKeyToAccount(k));
  const wallets = accounts.map((account) => createWalletClient({ chain, account, transport: http(rpc) }));
  const address = deployment.l1.priceReports;
  for (const a of accounts) {
    const ok = await pub.readContract({ address, abi: priceReportsAbi, functionName: "isReporter", args: [a.address] });
    if (!ok) log.warn("key is not a registered reporter", { reporter: a.address });
  }

  const vn = new VnMarket(vnCfg, assets, undefined, undefined, (msg, extra) => log.warn(msg, extra ?? {}));
  await vn.start();
  log.info("data loaded", { assets: assets.length, vndPerUsd: vn.vndPerUsd(), reporters: accounts.length });

  const registry = new Registry();
  const submitted = new Counter({ name: "pricereporter_submissions_total", help: "reports submitted", labelNames: ["result"], registers: [registry] });
  const lastRound = new Gauge({ name: "pricereporter_last_round", help: "last round this process reported", registers: [registry] });
  let lastOkAt = 0;

  const tick = async (): Promise<void> => {
    // the round by wall clock: the L1 makes blocks only when there are transactions, so the latest block's time (what
    // a view of currentRound() sees) can be minutes old, while the report lands in a new block stamped now
    const round = BigInt(Math.floor(Date.now() / 1000 / cfg.roundSec));
    if (await pub.readContract({ address, abi: priceReportsAbi, functionName: "finalized", args: [round] })) return;
    const done = new Set((await pub.readContract({ address, abi: priceReportsAbi, functionName: "submitters", args: [round] })).map((x) => x.toLowerCase()));
    const r = buildReport(assets, (s) => vn.quote(s));
    if (!r.ids.length) {
      log.warn("no prices to report yet");
      return;
    }
    // local phase (several keys in one process): rotate who goes first, so every reporter takes part over time
    const start = Number(round % BigInt(wallets.length));
    for (const w of [...wallets.slice(start), ...wallets.slice(0, start)]) {
      const who = w.account.address;
      if (done.has(who.toLowerCase())) continue;
      if (await pub.readContract({ address, abi: priceReportsAbi, functionName: "finalized", args: [round] })) break;
      try {
        // fixed gas: estimating runs against the latest block's (possibly old) time, where the new round does not exist
        // yet; the report itself lands in a new block stamped now. The finalizing report (median + ICM send) is the largest.
        const hash = await w.writeContract({ address, abi: priceReportsAbi, functionName: "submit", args: [round, r.ids, r.prices, r.ts], gas: REPORT_GAS });
        const rc = await pub.waitForTransactionReceipt({ hash });
        if (rc.status !== "success") throw new Error(`report reverted on-chain (tx ${hash})`);
        submitted.inc({ result: "ok" });
        log.info("reported", { round: Number(round), reporter: who, assets: r.ids.length, tx: hash });
      } catch (e) {
        submitted.inc({ result: "error" });
        log.warn("report failed", { round: Number(round), reporter: who, error: e instanceof Error ? e.message.split("\n")[0] : String(e) });
      }
    }
    lastRound.set(Number(round));
    lastOkAt = Date.now();
  };

  const hs = await startHealthServer({
    service: "price-reporter",
    port: envInt("HEALTH_PORT", 9310),
    registry,
    health: () => ({ ok: Date.now() - lastOkAt < cfg.reportEverySec * 3000, reporters: accounts.length, vndPerUsd: vn.vndPerUsd() }),
  });
  const loop = runLoop("report", cfg.reportEverySec * 1000, tick, log);
  onShutdown(async () => {
    vn.stop();
    await loop.stop();
    await hs.close();
  });
}

main().catch((e: unknown) => {
  createLogger("price-reporter").error("fatal", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
