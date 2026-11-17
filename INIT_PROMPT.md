# INIT_PROMPT.md — prompts for Claude Code

Paste one block per session. Each phase ends with its gate and a stop.

---

## Session 1 — P1 foundation

```
Read CLAUDE.md, spec.md, STRUCTURE.md, OPEN_QUESTIONS.md. Open apps/web/reference/pantado-app.html
in a browser to see the approved UI.

P1: create the root pnpm workspace (package.json, pnpm-workspace.yaml, tsconfig.base.json),
packages/shared (zod schemas + loaders for config/assets.json, config/networks/*.json,
config/services.json; types), scripts/gen-config.ts (assets.json → contracts/config/assets.fuji.json
+ indexer whitelists + app asset list), and the contracts/ Foundry skeleton with foundry.toml
(solc 0.8.26), OpenZeppelin 5.x, and contracts/config/params.json filled with the values in
STRUCTURE.md. Add tests for loaders and gen-config.

Gate: `pnpm -r test` green, `pnpm gen:config` output validates, `forge build` green.
Stop and summarize; list new OPEN_QUESTIONS.
```

## Session 2 — P2 core contracts

```
Build IndexFactory (createAndBuy, ticker rules, visibility, private → public), IndexVault (ERC-20
units, buy/sell/redeem with forfeit, level starts at 100, 0.01 dead units), PriceOracle (push,
maxAge, bands), FeeSplitter (30/20 split, creator claim, private → protocol), IndexLens, TestERC20 /
TestUSDC and TokenVenue, all per spec §5 and §7.

Tests: unit + fuzz + invariants — level after first buy = 100; buy keeps proportions; units never
exceed min ratio; sell/redeem pro rata; redeem works when prices are stale or buys are paused; fees
split exactly; weights ≥ 1 % and sum 100; 2–20 assets; ticker unique.
Gate: `forge test` green. Stop and summarize.
```

## Session 3 — P3 rebalancer

```
Build Rebalancer per spec §5.7–5.8: modes Off/Manual/Auto with delayed changes (Auto → Manual via
Off), Manual versions with reason, Auto trigger (relative drift θ 10–200 %, default 50 %, or
interval), plans, Dutch auction lots, partial fills, half-size retry, guards (notice, 5 %/24 h, 1 %
loss budget, 14 days).
Tests for every guard and transition, plus an Anvil scenario: +40 % shock on one asset of an Auto
index with θ = 20 % → plan → filler fills → max drift back under 10 %.
Gate: `forge test` green. Stop and summarize.
```

## Session 4 — P4 venues, router, deploy, SDK

```
Build StockVenue + PToken (spec §6: 24/7, spread 15 bps, size and OI caps, reserve ratio, pause new
buys per asset, quote == swapExactIn), SwapRouter (spec §7.1), script/Deploy.s.sol (reads
contracts/config/*, writes contracts/deployments/<network>.json), script/Demo.s.sol, and
packages/sdk (ABIs from forge out/, reads, tx builders).
Invariant: reserve ≥ 0 and Σ outstanding × mid ≤ reserve × 10000 / reserveRatioBps after any
sequence. E2E on Anvil: an index with 2 stocks + 2 tokens runs create/buy/sell/redeem/rebalance.
Gate: all forge tests green; Anvil demo passes. Stop and summarize.
```

## Session 5 — P5 keepers

```
Build keepers/price-pusher (reads canonical prices from market-data HTTP; skips + alerts when
|canonical − crossCheck| > deviationBps; pushes on interval or > moveBps), keepers/auction-filler,
keepers/rebalance-trigger, keepers/auto-fund (one-time test USDC + AVAX per new embedded wallet,
contest only). Tests with a fake price API and Anvil.
Gate: `pnpm -r test` green; Anvil run keeps all prices fresh for 30 min. Stop and summarize.
```

## Session 6 — P6 data

```
Build services/indexer (Ponder; fuji first, then avalanche and robinhood using gen-config
whitelists), services/market-data (spec §8, §9.3), services/api (spec §9.5–9.7 incl. /quote/*,
/presets, /assets/search). Port basket and venue math into packages/shared and golden-test it
against forge fixtures. Add scripts/check-level.ts. Confirm and record every mainnet / Robinhood
address before use (CLAUDE.md).
Gate: tests green; check-level passes on Anvil; /quote/basket equals the on-chain buy within 1 wei of
units. Stop and summarize.
```

## Session 7 — P7 app

```
Port apps/web/reference/pantado-app.html to Next.js (App Router) screen by screen — same layout,
copy, type scale, colors, left rail and account menu (spec §2, §12). Wire to services/api (REST + WS)
and packages/sdk. Privy auth + embedded wallets, gas sponsorship, all states in spec §12.
Gate: Playwright smoke on Anvil (every screen; create with review, buy, sell, redeem from Portfolio,
swap with search, private → public). Stop and summarize.
```

## Session 8 — P8 agent

```
Build services/agent per spec §10: provider-agnostic LLM client, tools over the public API only, SSE
/ask with Auto/Deep, /draft validated against the registry and spec §5 limits, /assessment, and the
agent-manager loop (Manual versions on its own indexes only, through the guards).
Gate: tool tests with recorded fixtures; draft validation tests; manager dry-run on Anvil.
Stop and summarize.
```

## Session 9 — P9 deploy

```
Write infra/ (docker-compose.contest.yml, Caddyfile, prometheus.yml, grafana dashboard, backup.sh,
production.md). Deploy contracts to Fuji, record addresses, seed demo indexes
(config/indexes.contest.json), start the stack, run test/e2e-app acceptance (spec §14) on Fuji.
Gate: acceptance green on Fuji; monitoring green. Stop, summarize, and list what is needed to
record the demo video.
```

## Session 10 — P10 (optional)

```
Build DexVenue and test it on an Avalanche mainnet fork with real pools for the token whitelist.
Keep it disabled in the contest profile. Gate: fork tests green.
```
