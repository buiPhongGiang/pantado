# CLAUDE.md — Pantado build rules

Read in this order: `spec.md` (what) → `STRUCTURE.md` (where) → `OPEN_QUESTIONS.md` (pending) →
`INIT_PROMPT.md` (current phase). Do not edit `spec.md` or `STRUCTURE.md`; log contradictions or
unclear points in `OPEN_QUESTIONS.md` with the option you chose and why.

## Work in phases
- Follow the phase table in `STRUCTURE.md`, one phase per session unless told otherwise.
- End of phase: run its gate, summarize what changed, list new OPEN_QUESTIONS, then stop.
- Never skip, weaken or delete a failing test. Fix the code.

## Invariants (never break)
- Buy mints pro rata to the current basket (min-ratio); sell is pro rata; redeem in-kind is always
  open, fee-free, price-free and cannot be paused.
- Auction prices never enter buy, sell or redeem.
- Stale price → buy, sell and auctions revert; redeem still works.
- Rebalance guards (notice, daily cap, loss budget, max duration) hold for every plan, including
  agent-managed ones.
- Index level starts at 100. Level computed by the indexer equals `IndexLens` at the same block.

## Config and addresses
- `config/assets.json` is the only asset list; regenerate derived files with `pnpm gen:config`.
- No chain ids, addresses, RPC URLs or thresholds in code — read `config/networks/<profile>.json`,
  `config/services.json`, `contracts/config/params.json`, `contracts/deployments/<network>.json`.
- Every external mainnet or Robinhood Chain address is confirmed (explorer + `cast call`) and
  recorded in `OPEN_QUESTIONS.md` (Verify table) before use. Unconfirmed → leave `TODO`.
- Secrets only in `.env` (git-ignored). Keeper, filler, auto-fund and agent-manager keys are testnet
  only.

## Data correctness
- One canonical price per asset (spec §8) for app, quotes and Fuji.
- Indexer writes idempotent on `(chainId, blockNumber, txHash, logIndex)`; accepted blocks only.
- TS ports of contract math are golden-tested against forge fixtures.

## Product honesty
- Stock data shows "Reference market: Robinhood Chain (on-chain)"; index data shows the Fuji tag in
  the `contest` profile.
- Never claim permissionless stock pools on Avalanche are live or dated.
- The agent never signs user transactions; only the agent-manager EOA acts, only on its own indexes,
  only through the guards.

## UI
- Port `apps/web/reference/pantado-app.html` screen by screen. Keep layout, copy, type scale,
  colors and the left rail exactly; do not add screens or menu items that are not in it or in
  spec §12.
- Brand: accent `#9052F9`, logo in `brand/`. Avalanche red only for the network dot and AVAX.

## Writing
- Code, comments, docs and commit messages describe Pantado on its own terms. Do not name other
  apps, products or repos as inspiration or comparison.

## Stack
Foundry + solc 0.8.26 + OpenZeppelin 5.x · pnpm workspace, TypeScript strict, viem, zod, vitest ·
Fastify · Ponder · Postgres + TimescaleDB · Redis · Next.js (App Router) · Privy · Playwright ·
Docker Compose, Caddy, Prometheus, Grafana.

## Style
Small modules, explicit types, no `any`. Typed errors surfaced to the UI with a clear message. Every
service and keeper exposes `/health` and Prometheus metrics.
