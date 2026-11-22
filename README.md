<p align="center"><img src="brand/banner.png" alt="Pantado" width="720"></p>

<h3 align="center">The Index Layer for Avalanche</h3>
<p align="center"><b>Index anything. Verify everything.</b></p>

<p align="center">
Pantado is open index infrastructure: anyone defines an index over tokenized stocks, Vietnamese stocks and Avalanche
tokens; a reporter network verifies every price on Pantado's own Avalanche L1 (independent operators next); and any app reads the
level on-chain as a verifiable benchmark. An AI analyst helps you research and draft. Nothing is bought or sold.<br>
Built on Avalanche · <a href="https://pantado.xyz">pantado.xyz</a>
</p>

---

## At a glance

| | |
|---|---|
| **What** | The Index Layer for Avalanche: a permissionless registry of indexes, a price network that verifies their inputs, and on-chain levels any app can use as a benchmark. |
| **Three parts** | **Define** any index on `IndexRegistry` (network fee only) · **Verify** every price on the Pantado Price Chain (Avalanche L1, median of the reporters' submissions, delivered over ICM) · **Read** the level from the API or `levelOf()` on-chain |
| **No trading** | Nothing is bought, sold, swapped, deposited or held. An index is data: its level is computed from published prices. No trading or holding fees. |
| **Real data** | Vietnamese stock prices are finalized by independent reporters on the **Pantado Price Chain**, an Avalanche L1, and delivered to the C-Chain over **Avalanche ICM**. US stocks come from an on-chain reference market; tokens from Avalanche mainnet. |
| **Assets** | 25 HOSE stocks · 25 tokenized US stocks · 35 Avalanche tokens |
| **Tested** | 113 Foundry tests · 174 TypeScript service tests · 178 web tests · browser smoke on every page |
| **Status** | This version runs end to end on a local Avalanche network (L1 + C-Chain). The earlier version (an index vault you bought into) is live on Fuji; see [v1 on Fuji](#v1-on-fuji). |

**Contents:** [Why](#why) · [What it does](#what-pantado-does) · [Features](#features) · [Indexes as data](#indexes-as-data) ·
[Pantado Price Chain](#pantado-price-chain) · [Stock data](#stock-data) · [Avalanche](#how-pantado-uses-avalanche) ·
[How it works](#how-it-works) · [Tested](#tested) · [Roadmap](#roadmap) · [Run it](#run-it-locally) · [v1 on Fuji](#v1-on-fuji)

## Why

Real-world assets are moving on-chain, but following a *theme* ("AI chips + Bitcoin", "Vietnam leaders") still means
picking assets, sizing weights and stitching data from many chains and exchanges by hand. Index providers decide which
indexes exist, and their data is closed. Vietnamese stocks, among the most traded in Southeast Asia, have no on-chain
price source at all.

**Pantado is the Index Layer: anyone can define an index, and every index has a level anyone can verify and build on.**

## What Pantado does

Pantado works like an index provider with the walls taken down: the methodology is a public contract, the inputs are
verified on a public chain, and the output is a number any wallet, app or agent can read.

1. **Understand the market.** Ask an AI agent about any listed stock, Vietnamese stock, token or index. Every number
   comes from a tool call on live data and is checked before you see it.
2. **Define an index.** Describe a theme and the agent drafts the basket: assets, weights, a 90-day backtest and the
   risks. Tune it in Create and sign once. It costs only the network fee: nothing is deposited, bought or held.
3. **Use the data.** The level starts at 100 and follows the prices. Compare your indexes against AVAX in Workspace,
   read any index through the API or straight from `IndexRegistry.levelOf()`, and see where every price came from on
   the Network page.

## Features

| | |
|---|---|
| **Market** | Indexes, US stocks, Vietnamese stocks (in ₫) and tokens with 24h / 7d / 30d change and volume; top movers per type; watchlist. |
| **Chart pages** | One page per index, stock, Vietnamese stock and token: candles, composition and price sources, rebalance history, and a "Use this data" card (REST, level history, on-chain read). |
| **Create** | 2–20 assets, presets (Equal / Market cap / Low volatility), 90-day backtest vs AVAX, rebalancing Off / Manual / Auto, public or private. One signature, network fee only. Edit the basket of your index later. |
| **Workspace** | Your indexes, your watchlist or all public ones, rebased to 100: return, vs AVAX, volatility, max drawdown, rebalance status. |
| **Network** | The Price Chain live: reporters, rounds finalized on the L1, ICM delivery time, prices on the C-Chain. |
| **Ask PantadoAI** | The robot button on every page. Auto (fast) or Deep (multi-step) mode; tickers in answers open their page; "Create from this" opens a drafted index. Research, not investment advice; it never signs transactions. |
| **Sign in** | Google, X, email or passkey (embedded wallet), or Core / MetaMask. |

## Indexes as data

`IndexRegistry` (Avalanche C-Chain) holds every index as a definition, not a vault:

- **Create.** Anyone with a wallet defines a basket (listed assets, weights, public or private). Its weights become
  fixed units per asset at the current prices, so the level starts at **100**. Cost: the network fee. Spam bounds:
  unique tickers and 20 public indexes per wallet.
- **Level.** `level = Σ units × price`, from the same oracle the Price Chain feeds; `levelOf(index)` reads it on-chain.
- **Rebalance.** Every change re-derives the units at the current level, so the level never jumps, and nothing is traded.
  - *Manual:* the creator publishes a new basket (assets and weights), now or after a notice of up to 30 days, at most once a day.
  - *Auto:* back to target weights when an asset drifts past its trigger (10–200 %) or every 30 days.
  - *Drops:* an asset that is delisted, or has no price for 7 days, leaves at its last price; its weight goes pro rata to the rest.
- **Anyone applies what is due.** One permissionless `poke(index)` drops, applies a scheduled basket or runs an Auto
  rebalance when `due(index)` says so; the rebalance keeper does it each minute, but no one has to trust it.

## Pantado Price Chain

Vietnamese stocks trade off-chain on HOSE. To make their prices verifiable, Pantado runs its own **Avalanche L1**
(Subnet-EVM, gas token PPC) where independent reporters submit prices:

```
 Reporters (read HOSE + VND rate) ──submit──▶ PriceReports (L1) ──median when 2 of 3 agree──▶ Avalanche ICM
                                                                                                   │
 Index levels ◀── PriceOracle (C-Chain) ◀── market-data ◀── PriceChainReceiver (C-Chain) ◀────────┘
```

- A round every 60 s; the median of each asset is final once the threshold of reporters has submitted.
- ICM delivers the final round to the C-Chain, typically within a second or two; the receiver accepts only the L1's
  contract and keeps the newest round.
- market-data takes the receiver's price as canonical and cross-checks it against its own direct read.
- The Network page shows every round, every reporter's gap from the median, and L1 vs C-Chain prices.

Today the team runs the validators and the 3 reporters; the plan is to hand both to independent operators
(see [Roadmap](#roadmap)).

## Stock data

| Market | Source | Shown as |
|---|---|---|
| Vietnamese stocks (25 HOSE) | HOSE matched trades, VND converted at the Vietcombank rate, finalized on the Pantado Price Chain | "Reference market: HOSE (off-chain)", prices in ₫ |
| US stocks (25) | Temporary on-chain reference market on Robinhood Chain, read-only, until permissionless stock pools launch on Avalanche (Pharaoh; not live yet) | "Reference market: Robinhood Chain (on-chain)" |
| Avalanche tokens (35) | Avalanche C-Chain mainnet pools, read-only | "Avalanche (on-chain)" |

Each asset's source is set in `config/assets.json`; switching a source needs no contract change. HOSE trades on
weekdays (09:00–11:30, 13:00–15:00 Vietnam time); outside those hours the last close is the current price.

## How Pantado uses Avalanche

| Avalanche piece | How Pantado uses it |
|---|---|
| **Avalanche L1** | The Pantado Price Chain: reporters submit prices, `PriceReports` finalizes the median per round |
| **Avalanche ICM (Teleporter)** | Delivers each final round from the L1 to the C-Chain `PriceChainReceiver` |
| **C-Chain** | `IndexRegistry` (indexes as data), `PriceOracle`, `AssetRegistry`; levels readable on-chain |
| **Avalanche mainnet data** | Prices, history and volume of 35 Avalanche tokens (read-only) |
| **Core wallet** | Sign in with Core (or MetaMask), or an embedded wallet |

## How it works

```
 Web app         Next.js · top bar (Market, Create, Workspace, Network) · Ask robot widget · Privy / Core / MetaMask
      │
 AI agent        Claude Haiku (Auto) / Sonnet (Deep) · read-only tools: prices, history, compare, backtest,
      │          index lookup, drafts · numbers checked against tool data · no trading tools
      │
 Data & services market-data (Avalanche + reference markets + HOSE) · Indexer (Ponder) · API (Fastify)
      │          · keepers: price reporters (L1), price pusher, rebalance trigger (poke)
      │
 Contracts       L1: PriceReports · C-Chain: PriceChainReceiver · PriceOracle · AssetRegistry · IndexRegistry
```

- One canonical price per asset; a stale price blocks creating or rebalancing an index, never reading its level.
- The indexer's level equals `IndexRegistry.levelOf()` at the same prices; every page shows where a price came from.
- The agent never signs user transactions.

## Tested

| Suite | Result |
|---|---|
| Contracts (Foundry: IndexRegistry 16, Price Chain 7, oracle, config, legacy v1 incl. invariants) | 113 passed, 2 skipped (mainnet fork) |
| TypeScript services: shared 44 · sdk 6 · api 29 · agent 31 · market-data 46 · indexer 1 · scripts 9 · rebalance trigger 5 · price reporter 3 | 174 passed |
| Web (view models, parsers, formatting) | 178 passed |
| Browser (Playwright, local stack) | every page at desktop and phone width: no JS errors, no horizontal overflow; create an index with one signature, no USDC moved, private → public |
| On the local stack | a scheduled basket applied by the keeper after its notice; a delisted asset dropped (level 100 → 99.98) |

## Roadmap

- **Done:** Price Chain L1 with ICM delivery (local) · indexes as data with Manual / Auto / scheduled rebalancing and
  drops · 25 Vietnamese stocks · new web app (Market, Create, Workspace, Network, Ask widget) · no-trading agent.
- **Next:** Price Chain and `IndexRegistry` on Fuji · independent reporters with their own data sources · partner
  validators for the L1 · listing and delisting by validator vote · the full HOSE list.
- **Later:** open API and SDK for builders · verified creators · more exchanges.

## Run it locally

1. Install Foundry, Node 20+, pnpm, Docker and the Avalanche CLI.
2. `cp .env.example .env` and fill what you need (see `OPEN_QUESTIONS.md` › Needs input).
3. `pnpm install && pnpm gen:config`
4. Price Chain (optional, for Vietnamese stocks through the L1):
   - create and run the L1: `avalanche blockchain create pantadoprice` (Subnet-EVM, chain 55177, ICM on), then
     `avalanche blockchain deploy pantadoprice --local`
   - `PRICECHAIN_L1_RPC=… PRICECHAIN_DEPLOYER_KEY=… scripts/pricechain-deploy-local.sh`
   - reporters: `cd keepers/price-reporter && set -a && . ../../.env.pricechain.local && set +a && PRICECHAIN_L1_RPC=… pnpm start`
5. Everything else on a local chain:
   `PRICECHAIN_NETWORK=local PRICECHAIN_L1_RPC=… STACK_PRICES=live STACK_KEEPERS=1 WEB_PORT=4002 pnpm --filter @pantado/e2e-app stack:anvil`
   → http://localhost:4002 (drop the two `PRICECHAIN_*` variables to read HOSE directly).

### Commands

| What | Command |
|---|---|
| All TS tests (Anvil tests need Foundry) | `pnpm -r test` |
| Contracts | `cd contracts && forge build && forge test` |
| Generated config is up to date | `pnpm gen:config:check` |
| Full local stack (Anvil, indexer, api, keepers, web) | `pnpm --filter @pantado/e2e-app stack:anvil` |
| Seed demo indexes | `pnpm --filter @pantado/scripts seed-demo` |
| App e2e on Anvil (Playwright) | `pnpm --filter @pantado/e2e-app e2e:anvil` |
| Ask evaluation against a live API | `pnpm --filter @pantado/agent eval` |
| Web dev server | `pnpm --filter @pantado/web dev` → http://localhost:4002 |

## Repository

`contracts/` (Foundry, solc 0.8.26, OpenZeppelin 5; `src/core/IndexRegistry.sol`, `src/pricechain/`) ·
`packages/shared` (config, schemas, contract math, HOSE client) · `packages/sdk` (ABIs, reads, tx builders) ·
`packages/service-kit` · `keepers/*` (price reporter, price pusher, rebalance trigger, …) ·
`services/{indexer,market-data,api,agent}` · `apps/web` (Next.js; screens in `src/ui/`) · `infra/` · `scripts/` ·
`test/e2e-app`.

Design documents: `spec.md` · `STRUCTURE.md` · `OPEN_QUESTIONS.md` (decisions; B98–B103 cover this version) ·
`CLAUDE.md` · `apps/web/reference/index-layer/` (approved UI).

## v1 on Fuji

The first version of Pantado sold indexes as vault tokens: one USDC payment bought every asset into an ERC-20 vault,
with sell, free redeem in kind and Dutch-auction rebalancing. It is live on Fuji (11 contracts, source-verified) and
stays there as a record; this version replaces buying with indexes as data.

<details>
<summary>v1 contracts and on-chain proof (Fuji, chain 43113)</summary>

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

</details>

## Team

[names and roles] · X: [@handle] · Contact: [email]
