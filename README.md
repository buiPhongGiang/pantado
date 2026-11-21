<p align="center"><img src="brand/banner.png" alt="Pantado" width="720"></p>

<h3 align="center">Any narrative. One token.</h3>

<p align="center">
An AI Agent that turns tokenized stocks and Avalanche tokens into indexes that can be asked, built, bought and shared.<br>
Built on Avalanche · live on Fuji testnet · <a href="https://pantado.xyz">pantado.xyz</a>
</p>

<p align="center">
<a href="https://github.com/buiPhongGiang/pantado/actions/workflows/contracts.yml"><img alt="contracts CI" src="https://github.com/buiPhongGiang/pantado/actions/workflows/contracts.yml/badge.svg"></a>
<img alt="Avalanche" src="https://img.shields.io/badge/Avalanche-live%20on%20Fuji-E84142?logo=avalanche&logoColor=white">
<img alt="Contracts" src="https://img.shields.io/badge/contracts-11%20on%20Fuji-E84142">
<img alt="Pharaoh-ready" src="https://img.shields.io/badge/stock%20pools-Pharaoh--ready-F2A900">
<img alt="AI agent" src="https://img.shields.io/badge/AI%20agent-Claude-D97757">
<img alt="Tests" src="https://img.shields.io/badge/tests-400%2B%20passing-2fbf71">
</p>

<p align="center">
<b>🌐 Live app:</b> <a href="https://pantado.xyz">pantado.xyz</a> · <b>🎬 Demo video:</b> [link] · <b>📊 Pitch deck:</b> [link] · <b>👥 Team:</b> [names]
</p>

---

## At a glance

| | |
|---|---|
| **What** | An AI agent that turns any market narrative into one index token: ask about a stock or token, draft a basket with weights, a backtest and risks, publish it, and buy the whole basket in one USDC transaction. |
| **Try it** | [pantado.xyz](https://pantado.xyz): sign in with Google, X, email or passkey (embedded wallet with test funds), or Core / MetaMask. |
| **Avalanche** | 11 contracts on Fuji · 35 Avalanche tokens priced from Avalanche mainnet · `DexVenue` routes tested on an Avalanche mainnet fork (30 routes, quote = swap) · ready for Pharaoh's permissionless stock pools |
| **Safety** | Mint and burn pro rata to the vault · redeem in kind always open and free · stale prices pause buys, sells and auctions, never redeem · rebalances under notice, daily cap and loss budget |
| **Tested** | 90 Foundry tests incl. invariants · 179 TypeScript · 127 web · Playwright e2e 7 / 7 |

**Contents:** [Why](#why) · [What it does](#what-pantado-does) · [Features](#features) ·
[Stock data](#stock-data-pharaoh-ready) · [Avalanche](#how-pantado-uses-avalanche) · [How it works](#how-it-works) · [Contracts](#contracts-on-avalanche-fuji-chain-43113) · [On-chain proof](#on-chain-proof-fuji) ·
[Tested](#tested) · [Roadmap](#roadmap) · [Run it](#run-it-locally)

## Why

Real-world assets are moving on-chain, but owning a *theme* is still a chore. To hold "AI chips + Bitcoin" you pick the assets, size the weights, sign one swap and one approval per asset, and then rebalance by hand forever. The data you need is scattered across chains and dashboards. Index products exist, but they are built by institutions, not by the people who have the idea.

**Pantado turns any market narrative into one token.**

## What Pantado does

Pantado lets anyone go from a market idea to owning it, in three steps:

1. **Understand the market.** Ask an AI agent about any stock or token and get answers built on live on-chain data, not guesses. Every number is pulled from a tool call and checked before you see it.
2. **Turn the idea into an index.** Describe a theme like "AI chips + Bitcoin" and the agent drafts the basket: assets, weights, a backtest and the risks. Tune it, publish it, and earn 0.20% every time someone trades it.
3. **Own the whole basket as one token.** One USDC payment buys every asset in a single transaction and gives you one ERC-20 backed by the real assets in its vault. Exit any time: sell for USDC, or redeem for the assets themselves, free.

No institution in between, no swap-by-swap execution, no manual rebalancing.

Index tokens have open supply: minted when you buy, burned when you exit, and always priced at the value of the vault. They never sell out.

## Features

| | |
|---|---|
| **Ask** | Live price, 24h / 7d / 30d change, range, volatility, drawdown, volume. Auto or Deep mode. Research, not investment advice. |
| **Build** | AI-drafted index with weights, backtest vs AVAX and main risks; **View** opens it in Create. |
| **Create & publish** | 2–20 tokenized stocks and Avalanche tokens, presets (Equal / Market cap / Low volatility), 90-day backtest, rebalancing Off / Manual / Auto. 5 USDC to publish. |
| **Buy & exit** | One transaction, all or nothing. Sell for USDC or redeem in kind: always open, fee-free, can't be paused. |
| **Portfolio** | Positions, PnL, drift, creator earnings, rebalance history. |
| **Sign in** | Google, X, email or passkey with an embedded wallet and test funds, or Core / MetaMask. |

**Marketplace:** 35 Avalanche tokens, 25 tokenized stocks and 10+ community indexes.

## Stock data: Pharaoh-ready

> **Pantado is built for Avalanche-native tokenized stocks.** Permissionless tokenized-stock pools on Avalanche are
> coming with **Pharaoh** but are not live yet. Until they are, this demo prices its tokenized stocks from a
> **temporary on-chain reference market: Robinhood Chain**, read-only. That is why a stock's page and the agent's
> answers name it as the reference market.
>
> - Token prices, history and volume come from Avalanche mainnet; only the stock data uses the stand-in.
> - On Fuji, stocks trade as test pTokens priced from that reference; nothing on Fuji has real value.
> - When the Avalanche stock pools launch, they replace the stand-in. Each stock's data source is set per asset in
>   `config/assets.json`; the switch needs no change to the index contracts.

## How Pantado uses Avalanche

| Avalanche piece | How Pantado uses it | Check it |
|---|---|---|
| **C-Chain (Fuji)** | 11 contracts run the product: factory, one ERC-20 vault per index, oracle, router, rebalancer, fee splitter, venues | [Contracts on Fuji](#contracts-on-avalanche-fuji-chain-43113): source verified on Snowtrace |
| **Avalanche mainnet data** | Prices, 24h / 7d / 30d history and volume for the 35 Avalanche tokens are read from Avalanche C-Chain mainnet (read-only) | Ask the agent about AVAX, BTC.b or JOE at [pantado.xyz](https://pantado.xyz) |
| **Avalanche DEX liquidity** | `DexVenue` routes buys and sells through constant-product pools on Avalanche C-Chain mainnet; every configured route is tested on a mainnet fork (quote = swap, both ways), plus the production deploy and an index's whole life with real USDC | `AVALANCHE_FORK_RPC=… forge test --match-path "test/fork/*"` |
| **Tokenized stocks on Avalanche** | Built for Avalanche-native stock pools (Pharaoh). Each asset's data source and venue are set per asset in `config/assets.json`; switching needs no contract change | [Stock data: Pharaoh-ready](#stock-data-pharaoh-ready) |
| **Core wallet** | Sign in with Core (or MetaMask), or with Google / X / email / passkey through an embedded wallet | [pantado.xyz](https://pantado.xyz) |

## How it works

```
 App & login     Next.js web app · Privy (Google, X, email, passkey) · Core / MetaMask
      │
 AI agent        Claude Haiku (Auto) / Sonnet (Deep) · tools: prices, history, backtest, quotes, drafts
      │          · number check against tool data · daily on-topic suggestions
      │
 Data & services Market data (Avalanche + Robinhood Chain mainnets, read-only) · Indexer (Ponder + Postgres)
      │          · API (Fastify) · keepers: price pusher, rebalance trigger, auction filler, auto-fund, monitor
      │
 Contracts       IndexFactory · IndexVault (ERC-20 per index) · PriceOracle · SwapRouter · Rebalancer
                 · FeeSplitter · venues (Fuji test venues; DexVenue for mainnet, fork-tested)
```

**Safety by design**

- Buy mints pro rata to the current basket; sell is pro rata; redeem in kind is always open.
- One canonical price per asset; a stale price pauses buys, sells and auctions, never redeem.
- Rebalances run under notice, a daily cap, a loss budget and a maximum duration, including agent-managed indexes.
- The agent never signs user transactions. Its own manager wallet acts only on its own indexes, through the same guards.

## Fees

| Fee | Value |
|---|---|
| Index buy / sell | 0.50% (0.30% protocol, 0.20% creator) |
| Index creation | 5 USDC |
| Single-asset swap | 0.10% |
| Redeem in kind | free |

## Contracts on Avalanche Fuji (chain 43113)

| Contract | Address |
|---|---|
| IndexFactory | [`0x85c168A2fEd642fA12cE718CC3b7DF3678cDdFE6`](https://testnet.snowtrace.io/address/0x85c168A2fEd642fA12cE718CC3b7DF3678cDdFE6) |
| IndexVault (implementation) | [`0xe71FBb70f7d0954D7795c7982742BdD5061F5918`](https://testnet.snowtrace.io/address/0xe71FBb70f7d0954D7795c7982742BdD5061F5918) |
| PriceOracle | [`0xB9c0E113AC16F0eD02032c1723DfAbA9C082104e`](https://testnet.snowtrace.io/address/0xB9c0E113AC16F0eD02032c1723DfAbA9C082104e) |
| SwapRouter | [`0x32752d7aF03Dad7540884C1b7E593B3974E8412b`](https://testnet.snowtrace.io/address/0x32752d7aF03Dad7540884C1b7E593B3974E8412b) |
| Rebalancer | [`0x6edB4AFf968E66975F931199EC3eABd07cC2C3eD`](https://testnet.snowtrace.io/address/0x6edB4AFf968E66975F931199EC3eABd07cC2C3eD) |
| FeeSplitter | [`0xF502cAf5F22c7f13B3207AE5204e1949a90c7366`](https://testnet.snowtrace.io/address/0xF502cAf5F22c7f13B3207AE5204e1949a90c7366) |
| AssetRegistry | [`0xE04Cec64c402E614bDDc615aA4998EA765AA01A8`](https://testnet.snowtrace.io/address/0xE04Cec64c402E614bDDc615aA4998EA765AA01A8) |
| IndexLens | [`0x249c7EeE6f5aac10E92E4E275E8F01e0b1CeE711`](https://testnet.snowtrace.io/address/0x249c7EeE6f5aac10E92E4E275E8F01e0b1CeE711) |
| Stock venue | [`0xD6ed8fbcEe091642FDC97d5F1fF9A663fF5D5f63`](https://testnet.snowtrace.io/address/0xD6ed8fbcEe091642FDC97d5F1fF9A663fF5D5f63) |
| Token venue | [`0xDe9D072Db625FeC54500199Ac07e75D5Fc4F9b8F`](https://testnet.snowtrace.io/address/0xDe9D072Db625FeC54500199Ac07e75D5Fc4F9b8F) |
| Test USDC | [`0xd42405859FEaF57f75F433CFC62A425d6187e4f6`](https://testnet.snowtrace.io/address/0xd42405859FEaF57f75F433CFC62A425d6187e4f6) |

All 60 test asset tokens are listed in `contracts/deployments/fuji.json`. Assets on Fuji are test tokens priced
from the mainnet reference markets; nothing on Fuji has real value.

## On-chain proof (Fuji)

Read from Fuji event logs and `IndexFactory.indexCount()` on 2026-11-21 (from block 61165284).

| Metric | Value |
|---|---|
| Indexes created | 12, by 8 wallets |
| Buys (`Bought`) | 38: 12 seed buys at creation + 26 buys from 9 wallets |
| Sells / redeems in kind | 1 / 1 (TBB) |
| Rebalance plans | 1 scheduled and started (HEDGE) |
| Rebalance auctions | 11 opened, 8 filled |

**One index, end to end: HEDGE "Digital Gold Hedge"**
([`0x08E2…863b`](https://testnet.snowtrace.io/address/0x08E2b0adab79184b51948Db8e05B97734eA2863b))

| Step | Event | Tx |
|---|---|---|
| Create index (5 USDC fee + seed buy) | `IndexCreated` | [`0x4378…6811`](https://testnet.snowtrace.io/tx/0x4378ed293d18a492f526cad4be481abdaadb55f63809a46461a1251f20276811) |
| Buy (pro rata to the basket) | `Bought` | [`0xfe64…7a7b`](https://testnet.snowtrace.io/tx/0xfe64ffe3bc2421582701b0bc07d594f9146732aab24f94078bb4f41af2617a7b) |
| Schedule rebalance (after notice) | `PlanScheduled` | [`0x5a1d…a4f4`](https://testnet.snowtrace.io/tx/0x5a1d1958d50ffdc38ffb8069ef14fbe4fccb44a621ba77aaec1191951d6ea4f4) |
| Start rebalance (loss budget set) | `PlanStarted` | [`0xc5d7…7de3`](https://testnet.snowtrace.io/tx/0xc5d7a2e08b5f96dd6e84de83cdcbb8f282ca07aea24a5516e40e3529d4507de3) |
| Open Dutch auction | `AuctionOpened` | [`0x501b…a414`](https://testnet.snowtrace.io/tx/0x501b6526d63ca296b0433649383e329cdb820e97da9359b394e327f37bbba414) |
| Auction filled by filler | `AuctionFilled` | [`0x06e8…e5a9`](https://testnet.snowtrace.io/tx/0x06e85cf6544861330beefa2c7cc20509d494263efe8d121442918e184b31e5a9) |
| Buy during rebalance | `Bought` | [`0xdc30…3379`](https://testnet.snowtrace.io/tx/0xdc30001a8d1a5417b2485fe56cf72b5d03ae55637b4226d15c9f9a4e43bd3379) |

**All 12 indexes**

| Ticker | Index | Created in tx |
|---|---|---|
| TBB | [`0x86A9…6690`](https://testnet.snowtrace.io/address/0x86A95f67F3f5fd8A3e5D31435DF689fFA0646690) | [`0xe7ad…5f7e`](https://testnet.snowtrace.io/tx/0xe7ad812096d1ac1b92eeffcd0d92c5536a973e018d38459f5b7c435fe0695f7e) |
| CHIP | [`0x9CB9…2D82`](https://testnet.snowtrace.io/address/0x9CB91fC4D971Dd217a3Cb1C010C4eC8E1F2d2D82) | [`0x4d83…0a7d`](https://testnet.snowtrace.io/tx/0x4d8390c0bc7e461891d33263f48ea31181d1c8df1c081eac4c62bb0e904f0a7d) |
| MAG7 | [`0xB146…DE22`](https://testnet.snowtrace.io/address/0xB146CB87086E98D1A4053640c2A316Fe7fD5De22) | [`0xdfab…0458`](https://testnet.snowtrace.io/tx/0xdfabba359a8a8ec43fd236b2489a2c87205da84ea6052d667a4b32fe9faa0458) |
| CSTK | [`0x2B6a…A479`](https://testnet.snowtrace.io/address/0x2B6a2ae01efF233296d2384Fe89E94f10668A479) | [`0xb3e4…e8ba`](https://testnet.snowtrace.io/tx/0xb3e437dd1ea44224afa1e3664f58bf957095d6c8ca0dba31e6ac193ca4d8e8ba) |
| MYBK | [`0xD8bA…667B`](https://testnet.snowtrace.io/address/0xD8bA107462507c69eB47eD9Dd2e2D4069eF6667B) | [`0x13f7…6e9a`](https://testnet.snowtrace.io/tx/0x13f7444bf010661e3c124bb1f1fa5973ac1e60572cd33d4f3420ecf7517d6e9a) |
| AVDEX | [`0xa5C6…0cC6`](https://testnet.snowtrace.io/address/0xa5C6DDC25A3EdA037BA5885C852ff34E979A0cC6) | [`0xf31c…661c`](https://testnet.snowtrace.io/tx/0xf31cdad2fd3b5bbd13fac13d8f5174e25191291aec7b89e63fba46ed3f8b661c) |
| AVBLU | [`0xc311…C8F3`](https://testnet.snowtrace.io/address/0xc311175Fd1Ccb0951F9a7437dd9796993E70C8F3) | [`0x4e9c…f780`](https://testnet.snowtrace.io/tx/0x4e9c479587f7a0ece7cbfab056c90ecd7fb133ea02e8c01763173e0c1799f780) |
| AVMEME | [`0xe327…39C7`](https://testnet.snowtrace.io/address/0xe327d31574f8b7911680bC20298AD749aCc039C7) | [`0xaada…1428`](https://testnet.snowtrace.io/tx/0xaada168c340cb28c50d083b7ac85c1139fc5b207c055ac7d0846bb69ea351428) |
| DEFI | [`0x8B9A…2b51`](https://testnet.snowtrace.io/address/0x8B9A2c62A696Ae24179Da4870e15b4C0dfb72b51) | [`0xae34…55a5`](https://testnet.snowtrace.io/tx/0xae34772278997de4b9aeb09230e3e6e582961010ef013eeaad252e32c92f55a5) |
| HEDGE | [`0x08E2…863b`](https://testnet.snowtrace.io/address/0x08E2b0adab79184b51948Db8e05B97734eA2863b) | [`0x4378…6811`](https://testnet.snowtrace.io/tx/0x4378ed293d18a492f526cad4be481abdaadb55f63809a46461a1251f20276811) |
| WSAVX | [`0x1555…14d3`](https://testnet.snowtrace.io/address/0x1555cd6AfE77a751872f689a1D76d02c04Cf14d3) | [`0x73ee…0866`](https://testnet.snowtrace.io/tx/0x73ee358695b6498142d5288256a259356b881aa194b32361bf99cca93e210866) |
| AIB826 | [`0x7fDF…5406`](https://testnet.snowtrace.io/address/0x7fDF97e6A1899ed1A87972E9e0f5eaA783175406) | [`0xe6fa…d9af`](https://testnet.snowtrace.io/tx/0xe6facd24bc8464ba388183ec16f18ce8a5a67ac089aa2fd4c65c887d2dc0d9af) |

**Exit paths on TBB** ([`0x86A9…6690`](https://testnet.snowtrace.io/address/0x86A95f67F3f5fd8A3e5D31435DF689fFA0646690)), 2026-11-21

| Step | Event | Tx |
|---|---|---|
| Sell 0.3 units for USDC (pro rata, fresh prices) | `Sold` | [`0xb3cc…a666`](https://testnet.snowtrace.io/tx/0xb3ccc5551f3b95ff69be7d8e90358ed24bb58e5461f2edb874a0362acc51a666) |
| Redeem 0.3 units in kind (fee-free, price-free) | `Redeemed` | [`0x3661…82c7`](https://testnet.snowtrace.io/tx/0x36616e9baf506a1bd068719d3765991211411964606d94936b0c92e47ead82c7) |

Before the price pusher refreshed the oracle, the same sell reverted with `PriceStale` while redeem still succeeded:
stale prices block buy and sell, never redeem.

## Tested

| Suite | Result |
|---|---|
| Contracts (Foundry, incl. invariants) | 90 passed (+2 mainnet-fork tests, run with `AVALANCHE_FORK_RPC`) |
| Mainnet fork | 30 DexVenue routes: quote = swap; production deploy → create, buy, sell, redeem |
| TypeScript (shared, sdk, service-kit, api, agent, market-data, keepers, scripts) | 179 passed |
| Web (vitest) | 127 passed |
| End to end (Playwright, local chain) | 7 / 7 |

TypeScript ports of the contract math are golden-tested against Foundry fixtures; the index level from the indexer
equals `IndexLens` at the same block.

## Roadmap

- **Done:** product UI · 11 contracts live on Fuji · AI agent · mainnet price data · DEX venue tested on a mainnet fork.
- **Next:** mainnet beta, completed once Pharaoh's permissionless stock pools launch on Avalanche (not live yet;
  until then stock data uses the temporary reference market, see [Stock data: Pharaoh-ready](#stock-data-pharaoh-ready)).
- **Later:** meme-token indexes on Avalanche · open API for outside agents · verified creators.

## Run it locally

1. Install Foundry, Node 20+, pnpm and Docker.
2. `cp .env.example .env` and fill what you need (see `OPEN_QUESTIONS.md` › Needs input).
3. `pnpm install && pnpm gen:config`
4. Local chain with everything: `STACK_PRICES=live STACK_KEEPERS=1 WEB_PORT=4002 pnpm --filter @pantado/e2e-app stack:anvil`
   → http://localhost:4002

Against Fuji with Docker: `infra/docker-compose.contest.yml` + `infra/docker-compose.fuji-local.yml` (see their
headers); public deploy: `infra/contest.md`.

### Commands

| What | Command |
|---|---|
| All TS tests (Anvil tests need Foundry) | `pnpm -r test` |
| Contracts | `cd contracts && forge build && forge test` |
| Generated config is up to date | `pnpm gen:config:check` |
| End-to-end contract demo on Anvil | `contracts/script/anvil-demo.sh` |
| Full local stack (Anvil, indexer, api, web) | `pnpm --filter @pantado/e2e-app stack:anvil` |
| App e2e on Anvil (Playwright) | `pnpm --filter @pantado/e2e-app e2e:anvil` |
| Level check (indexer vs IndexLens) | `INDEXER_URL=… pnpm --filter @pantado/scripts check-level` |
| Seed demo indexes | `pnpm --filter @pantado/scripts seed-demo` |
| Refresh seed prices / bands from the live market | `MARKET_DATA_URL=… pnpm --filter @pantado/scripts refresh:seeds [--check]` |
| Acceptance (spec §14) | `pnpm --filter @pantado/e2e-app acceptance` (see `test/e2e-app/README.md`) |
| Deploy to Fuji (one command) | `pnpm --filter @pantado/scripts deploy:fuji` (`--check` for a dry preflight) |
| Ship to a server | `VPS=user@host infra/deploy-vps.sh [--bootstrap]` |
| Acceptance on Fuji | `VPS=user@host infra/acceptance-fuji.sh` |
| Web dev server | `pnpm --filter @pantado/web dev` → http://localhost:4002 |
| Demo screenshots / video scenes | `pnpm --filter @pantado/e2e-app exec tsx demo/shots.ts <dir>` · `… demo/video.ts <dir>` |

## Repository

`contracts/` (Foundry, solc 0.8.26, OpenZeppelin 5) · `packages/shared` (config, schemas, contract math port) ·
`packages/sdk` (ABIs, reads, tx builders) · `packages/service-kit` (health, metrics, keys) · `keepers/*` ·
`services/{indexer,market-data,api,agent}` · `apps/web` (Next.js) · `infra/` (compose, Caddy, Prometheus, Grafana) ·
`scripts/` · `test/e2e-app`.

Design documents: `spec.md` (what the product does) · `STRUCTURE.md` (where everything lives, build phases) ·
`OPEN_QUESTIONS.md` (inputs, defaults, verified addresses, decisions) · `CLAUDE.md` (build rules) ·
`apps/web/reference/pantado-app.html` (approved UI).

## Team

[names and roles] · X: [@handle] · Contact: [email]
