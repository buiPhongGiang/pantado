<p align="center"><img src="brand/banner.png" alt="Pantado" width="720"></p>

<h3 align="center">Any narrative. One token.</h3>

<p align="center">
An AI agent that turns tokenized stocks and Avalanche tokens into indexes you can ask about, build, buy and share.<br>
Built on Avalanche · live on Fuji testnet · <a href="https://pantado.xyz">pantado.xyz</a>
</p>

<p align="center">
<b>Demo video:</b> [link] · <b>Pitch deck:</b> [link] · <b>Live app:</b> <a href="https://pantado.xyz">pantado.xyz</a> · <b>Team:</b> [names]
</p>

---

## Why

Real-world assets are moving on-chain, but owning a theme ("AI chips + Bitcoin", "Avalanche DeFi") still means
picking assets, sizing weights, one swap and one approval per asset, and rebalancing by hand. Prices, volume and
history are spread across chains, and index products are built by institutions, not by the people who have the idea.

## What Pantado does

| | |
|---|---|
| **Ask** | An AI agent answers questions about any listed stock or token with live on-chain data: price, 24h / 7d / 30d change, range, volatility, drawdown, volume. Every number in an answer comes from a tool call and is checked against the tool data before it is shown. No investment advice. |
| **Build** | Describe a theme and the agent drafts an index: assets, weights, a backtest against AVAX and the main risks. **View** opens the draft in Create. |
| **Create & publish** | Mix tokenized stocks and Avalanche tokens (2–20 assets). Three presets (Equal, Market cap, Low volatility), hand tuning, a 90-day backtest, rebalancing Off / Manual / Auto. Publish for 5 USDC and earn 0.20% of every buy and sell of your index. |
| **Buy** | Pay USDC, receive one ERC-20 backed by every asset in its vault, in one transaction. If any purchase fails, the whole trade reverts. |
| **Exit** | Sell for USDC, or **redeem in kind** for the underlying assets: always open, fee-free, needs no price, cannot be paused. |
| **Portfolio** | Positions, PnL, drift from target, creator earnings and each index's rebalance history. |
| **Sign in** | Google, X, email or passkey (embedded wallet, test USDC and a little gas on first sign-in), or Core / MetaMask. |

The marketplace lists 35 Avalanche tokens, 25 tokenized stocks and 10+ community indexes.

## A note on stock data

> **Pantado is built for Avalanche-native tokenized stocks.** Permissionless tokenized-stock pools on Avalanche are
> coming with **Pharaoh** but are not live yet. Until they are, this demo prices its tokenized stocks from a
> **temporary on-chain reference market: Robinhood Chain**, read-only. That is why a stock's page and the agent's
> answers name it as the reference market.
>
> - Token prices, history and volume come from Avalanche mainnet; only the stock data uses the stand-in.
> - On Fuji, stocks trade as test pTokens priced from that reference; nothing on Fuji has real value.
> - When the Avalanche stock pools launch, they replace the stand-in. Each stock's data source is set per asset in
>   `config/assets.json`; the switch needs no change to the index contracts.

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
  until then stock data uses the temporary reference market, see [A note on stock data](#a-note-on-stock-data)).
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
